import * as apiGateway from 'aws-cdk-lib/aws-apigateway';
import * as cdk from 'aws-cdk-lib';
import * as lambdaNodeJS from 'aws-cdk-lib/aws-lambda-nodejs'
import * as cwlogs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs'

interface ECommerceApiStackProps extends cdk.StackProps {
    productsFetchHandler: lambdaNodeJS.NodejsFunction;
}

export class ECommerceApiGatewayStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props: ECommerceApiStackProps) {
        super();

        const logGroup = new cwlogs.LogGroup(this, 'ECommerceApiLogs')

        const api = new apiGateway.RestApi(this, 'ECommerceApiGateway', {
            restApiName: 'ECommerceApiGateway',
            deployOptions: {
                accessLogDestination: new apiGateway.LogGroupLogDestination(logGroup),
                accessLogFormat: apiGateway.AccessLogFormat.jsonWithStandardFields({
                    httpMethod: true,
                    ip: true,
                    protocol: true,
                    requestTime: true,
                    resourcePath: true,
                    responseLength: true,
                    status: true,
                    caller: true,
                    user: true
                })
            }
        });

        const productsFetchIntegration = new apiGateway.LambdaIntegration(props.productsFetchHandler);
        
        // "/products"
        const productsResource = api.root.addResource('products')   
        productsResource.addMethod('GET', productsFetchIntegration);
    }
}