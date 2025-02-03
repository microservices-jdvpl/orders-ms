# Dockerfile de products-ms
FROM node:18-slim

# Instalar OpenSSL
RUN apt-get update && apt-get install -y openssl

# Crear directorio de trabajo
WORKDIR /usr/src/app

# Copiar el package.json y el lock para instalar dependencias
COPY package*.json ./

# Instalar dependencias
RUN npm install

# Copiar el código fuente
COPY . .

# Puerto por defecto
EXPOSE 8000

# Comando por defecto
CMD ["npm", "run", "dev"]
