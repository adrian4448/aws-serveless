#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { ECommerceApiGatewayStack } from '../lib/ecommerceApiGateway';
import { ProductsAppStack } from '../lib/productsApp-stack';
import { ProductsAppLayers } from '../lib/productsAppLayers-stack';

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
})

const productsAppStack = new ProductsAppStack(app, 'ProductsApp', {
  tags: tags,
  env: env
});

productsAppStack.node.addDependency(productsAppLayerStack);

const ecommerceApiGatewayStack = new ECommerceApiGatewayStack(app, 'ECommerceApiGateway', {
  productsFetchHandler: productsAppStack.productsFetchHandler,
  productsAdminHandler: productsAppStack.productsAdminHandler,
  tags: tags,
  env: env,
});

ecommerceApiGatewayStack.node.addDependency(productsAppStack);