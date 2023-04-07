import * as apiGateway from 'aws-cdk-lib/aws-apigateway';
import * as cdk from 'aws-cdk-lib';
import * as lambdaNodeJS from 'aws-cdk-lib/aws-lambda-nodejs'
import * as cwlogs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs'

interface ECommerceApiStackProps extends cdk.StackProps {
    productsFetchHandler: lambdaNodeJS.NodejsFunction;
    productsAdminHandler: lambdaNodeJS.NodejsFunction;
}

export class ECommerceApiGatewayStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props: ECommerceApiStackProps) {
        super(scope, id, props);

        const logGroup = new cwlogs.LogGroup(this, 'ECommerceApiLogs')

        const api = new apiGateway.RestApi(this, 'ECommerceApiGateway', {
            restApiName: 'ECommerceApiGateway',
            cloudWatchRole: true,
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

        // "GET /products"
        const productsResource = api.root.addResource('products')   
        productsResource.addMethod('GET', productsFetchIntegration);

        // "GET /products/{id}"
        const productsIdResource = productsResource.addResource("{id}");
        productsIdResource.addMethod('GET', productsFetchIntegration);

        const productsAdminIntegration = new apiGateway.LambdaIntegration(props.productsAdminHandler);
        
        // "POST /products"
        productsResource.addMethod('POST', productsAdminIntegration);
        
        // "DELETE, PUT /products/{id}"
        productsIdResource.addMethod('DELETE', productsAdminIntegration);
        productsIdResource.addMethod('PUT', productsAdminIntegration)


    }
}