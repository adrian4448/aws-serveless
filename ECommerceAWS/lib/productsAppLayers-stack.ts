import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as ssm from 'aws-cdk-lib/aws-ssm';

export class ProductsAppLayers extends cdk.Stack {

    constructor(scope: Construct, id: string, props?: cdk.StackProps) {
        super(scope, id, props)

        const productsLayers = new lambda.LayerVersion(this, 'ProductsLayer', {
            code: lambda.Code.fromAsset('lambda/products/layers/productsLayer'),
            compatibleRuntimes: [lambda.Runtime.NODEJS_14_X],
            layerVersionName: 'ProductsLayer',
            removalPolicy: cdk.RemovalPolicy.RETAIN
        });

        const productEventsLayers = new lambda.LayerVersion(this, 'ProductsEventsLayer', {
            code: lambda.Code.fromAsset('lambda/products/layers/productsEventsLayer'),
            compatibleRuntimes: [lambda.Runtime.NODEJS_14_X],
            layerVersionName: 'ProductsEventsLayer',
            removalPolicy: cdk.RemovalPolicy.RETAIN
        })

        new ssm.StringParameter(this, 'ProductsLayerVersionArn', {
            parameterName: 'ProductsLayerVersionArn',
            stringValue: productsLayers.layerVersionArn
        });

        new ssm.StringParameter(this, 'ProductsEventsLayerVersionArn', {
            parameterName: 'ProductsEventsLayerVersionArn',
            stringValue: productEventsLayers.layerVersionArn
        })
    }
}