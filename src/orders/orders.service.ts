import {
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { CreateOrderDto } from './dto/create-order.dto';
import { PrismaClient } from '@prisma/client';
import { ClientProxy, RpcException } from '@nestjs/microservices';
import { OrderPaginationDto } from './dto/order-pagination.dto';
import { OrderStatusDto } from './dto/order.status.dto';
import { NATS_SERVICE } from 'src/config/constants';
import { firstValueFrom } from 'rxjs';
import { OrderWithProducts } from './interfaces/order-with-product.interface';
import { PaidOrderDto } from './dto/paid-order.dto';

@Injectable()
export class OrdersService extends PrismaClient implements OnModuleInit {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    @Inject(NATS_SERVICE) private readonly productsClient: ClientProxy,
  ) {
    super();
  }

  async onModuleInit() {
    await this.$connect();
    this.logger.log('Connected to the database');
  }
  async create(createOrderDto: CreateOrderDto) {
    try {
      const productIds = createOrderDto.items.map(
        (product) => product.productId,
      );
      const ids = Array.from(new Set(productIds));
      const products: any[] = await firstValueFrom(
        this.productsClient.send({ cmd: 'valide_products_ids' }, { ids }),
      );

      const totalAmount = createOrderDto.items.reduce((acc, orderItem) => {
        const price = products.find(
          (product) => product.id === orderItem.productId,
        ).price;
        return acc + price * orderItem.quantity;
      }, 0);

      const totalItems = createOrderDto.items.reduce((acc, orderItem) => {
        return acc + orderItem.quantity;
      }, 0);

      const order = await this.order.create({
        data: {
          totalAmount: totalAmount,
          totalItems: totalItems,
          OrderItem: {
            createMany: {
              data: createOrderDto.items.map((orderItem) => ({
                price: products.find(
                  (product) => product.id === orderItem.productId,
                ).price,
                productId: orderItem.productId,
                quantity: orderItem.quantity,
              })),
            },
          },
        },
        include: {
          OrderItem: {
            select: {
              price: true,
              quantity: true,
              productId: true,
            },
          },
        },
      });

      return {
        ...order,
        OrderItem: order.OrderItem.map((orderItem) => ({
          ...orderItem,
          name: products.find((product) => product.id === orderItem.productId)
            .name,
        })),
      };
    } catch (error) {
      throw new RpcException({
        message: error.message,
        status: HttpStatus.INTERNAL_SERVER_ERROR,
      });
    }
  }

  async findAll(orderpagination: OrderPaginationDto) {
    const totalOrders = await this.order.count({
      where: {
        status: orderpagination.status,
      },
    });
    const currentPage = orderpagination.page;
    const perPage = orderpagination.limit;
    return {
      data: await this.order.findMany({
        where: {
          status: orderpagination.status,
        },
        skip: (currentPage - 1) * perPage,
        take: perPage,
      }),
      totalOrders,
      currentPage,
      lastPage: Math.ceil(totalOrders / perPage),
    };
  }

  async findOne(id: string) {
    const order = await this.order.findFirst({
      where: { id },
      include: {
        OrderItem: {
          select: {
            price: true,
            quantity: true,
            productId: true,
          },
        },
      },
    });
    if (!order) {
      throw new RpcException({
        message: `Order with ${id} not found`,
        status: HttpStatus.NOT_FOUND,
      });
    }
    const productIds = order.OrderItem.map((orderItem) => orderItem.productId);
    const products: any[] = await firstValueFrom(
      this.productsClient.send(
        { cmd: 'valide_products_ids' },
        { ids: productIds },
      ),
    );

    return {
      ...order,
      OrderItem: order.OrderItem.map((orderItem) => ({
        ...orderItem,
        name: products.find((product) => product.id === orderItem.productId)
          .name,
      })),
    };
  }

  async changeStatus(body: OrderStatusDto) {
    const order = await this.findOne(body.id);
    if (order.status === body.status) {
      return order;
    }
    return this.order.update({
      where: { id: body.id },
      data: { status: body.status },
    });
  }
  async createPaymentsSession(order: OrderWithProducts) {
    const paymentSession = await firstValueFrom(
      this.productsClient.send('create.payment.session', {
        orderId: order.id,
        currency: 'usd',
        items: order.OrderItem.map((item) => ({
          name: item.name,
          price: item.price,
          quantity: item.quantity,
        })),
      }),
    );
    return paymentSession;
  }

  async payOrder(paidOrderDto: PaidOrderDto) {
    this.logger.debug('Paid order');
    this.logger.log(paidOrderDto);
    const order = await this.order.update({
      where: { id: paidOrderDto.orderId },
      data: {
        status: 'PAID',
        paid: true,
        OrderReceipt: {
          create: {
            receiptUrl: paidOrderDto.receiptUrl,
            stripeChargeId: paidOrderDto.stripePaymentId,
          },
        },
      },
    });
    return order;
  }
}
