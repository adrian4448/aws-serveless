#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { ECommerceApiGatewayStack } from '../lib/ecommerceApiGateway';
import { ProductsAppStack } from '../lib/productsApp-stack';
import { ProductsAppLayers } from '../lib/productsAppLayers-stack';
import { EventsDdbStack } from '../lib/eventsDdb-stack';
import { OrderAppLayersStack } from '../lib/orderAppLayers-stack';
import { OrdersAppStack } from '../lib/ordersApp-stack';

const app = new cdk.App();

const env: cdk.Environment = {
  account: '317043535969',
  region: 'us-east-1'
}

const tags = {
  cost: 'ECommerce',
  team: 'Desenvolvimento'
}

const productsAppLayerStack = new ProductsAppLayers(app, 'ProductsAppLayers', {
  tags: tags,
  env: env
});

const eventsDdbStack = new EventsDdbStack(app, 'EventsDdbStack', {
  tags: tags,
  env: env
});

const productsAppStack = new ProductsAppStack(app, 'ProductsApp', {
  tags: tags,
  env: env,
  eventsDdb: eventsDdbStack.table
});

productsAppStack.node.addDependency(productsAppLayerStack);
productsAppStack.node.addDependency(eventsDdbStack);


const ordersAppLayersStack = new OrderAppLayersStack(app, 'OrdersAppLayersStack', {
  tags: tags,
  env: env
});

const ordersAppStack = new OrdersAppStack(app, 'OrdersAppStack', {
  tags: tags,
  env: env,
  productsDdb: productsAppStack.productsDdb
});

ordersAppStack.node.addDependency(ordersAppLayersStack);
ordersAppStack.node.addDependency(productsAppLayerStack);

const ecommerceApiGatewayStack = new ECommerceApiGatewayStack(app, 'ECommerceApiGateway', {
  productsFetchHandler: productsAppStack.productsFetchHandler,
  productsAdminHandler: productsAppStack.productsAdminHandler,
  ordersHandler: ordersAppStack.ordersHandler,
  tags: tags,
  env: env,
});

ecommerceApiGatewayStack.node.addDependency(productsAppStack);
ecommerceApiGatewayStack.node.addDependency(ordersAppStack);