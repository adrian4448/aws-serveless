import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as ssm from 'aws-cdk-lib/aws-ssm';

export class OrderAppLayersStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props?: cdk.StackProps) {
        super(scope, id, props);

        const ordersLayers = new lambda.LayerVersion(this, 'OrdersLayer', {
            code: lambda.Code.fromAsset('lambda/orders/layers/ordersLayers'),
            compatibleRuntimes: [lambda.Runtime.NODEJS_14_X],
            layerVersionName: 'OrdersLayers',
            removalPolicy: cdk.RemovalPolicy.RETAIN
        });

        new ssm.StringParameter(this, 'OrdersLayerVersionArn', {
            parameterName: 'OrdersLayerVersionArn',
            stringValue: ordersLayers.layerVersionArn
        });

        const ordersApiLayer = new lambda.LayerVersion(this, 'OrdersApiLayer', {
            code: lambda.Code.fromAsset('lambda/orders/layers/ordersApiLayer'),
            layerVersionName: 'OrdersApiLayer',
            removalPolicy: cdk.RemovalPolicy.RETAIN
        });

        new ssm.StringParameter(this, 'OrdersApiLayerVersionArn', {
            parameterName: 'OrdersApiLayerVersionArn',
            stringValue: ordersApiLayer.layerVersionArn
        });

        const orderEventsLayer = new lambda.LayerVersion(this, 'OrdersEventsLayer', {
            code: lambda.Code.fromAsset('lambda/orders/layers/orderEventsLayer'),
            layerVersionName: 'OrderEventsLayer',
            removalPolicy: cdk.RemovalPolicy.RETAIN
        });

        new ssm.StringParameter(this, 'OrdersEventsLayerVersionArn', {
            parameterName: 'OrdersEventsLayerVersionArn',
            stringValue: orderEventsLayer.layerVersionArn
        });

        const orderEventsRepositoryLayer = new lambda.LayerVersion(this, 'OrderEventsRepositoryLayer', {
            code: lambda.Code.fromAsset('lambda/orders/layers/orderEventsRepositoryLayer'),
            layerVersionName: 'OrderEventsRepositoryLayer',
            removalPolicy: cdk.RemovalPolicy.RETAIN
        });

        new ssm.StringParameter(this, 'OrdersEventsRepositoryLayerVersionArn', {
            parameterName: 'OrdersEventsRepositoryLayerVersionArn',
            stringValue: orderEventsRepositoryLayer.layerVersionArn
        });
    }
}