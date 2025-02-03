import { Controller, ParseUUIDPipe } from '@nestjs/common';
import { EventPattern, MessagePattern, Payload } from '@nestjs/microservices';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { OrderPaginationDto } from './dto/order-pagination.dto';
import { OrderStatusDto } from './dto/order.status.dto';
import { PaidOrderDto } from './dto/paid-order.dto';

@Controller()
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @MessagePattern('createOrder')
  async create(@Payload() createOrderDto: CreateOrderDto) {
    const order = await this.ordersService.create(createOrderDto);
    const orderWithPaidAt = { ...order, paidAt: null };
    const paymentSession =
      await this.ordersService.createPaymentsSession(orderWithPaidAt);
    return { order, paymentSession };
  }

  @MessagePattern('findAllOrders')
  findAll(@Payload() orderPagination: OrderPaginationDto) {
    console.log({ object: orderPagination });
    return this.ordersService.findAll(orderPagination);
  }

  @MessagePattern('findOneOrder')
  findOne(@Payload(ParseUUIDPipe) id: string) {
    return this.ordersService.findOne(id);
  }

  @MessagePattern('changeOrderStatus')
  update(body: OrderStatusDto) {
    return this.ordersService.changeStatus(body);
  }
  @EventPattern('payment.succeeded')
  payOrder(@Payload() payload: PaidOrderDto) {
    return this.ordersService.payOrder(payload);
  }
}
