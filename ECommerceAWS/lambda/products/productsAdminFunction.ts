import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { DynamoDB, Lambda } from "aws-sdk";
import { ProductEvent, ProductEventType } from "/opt/nodejs/productsEventsLayer";
import { Context } from "vm";
import { Product, ProductRepository } from "/opt/nodejs/productsLayer";
import * as AWSXray from 'aws-xray-sdk';

AWSXray.captureAWS(require('aws-sdk'));

const productsDdb = process.env.PRODUCTS_DDB!;
const productsEventsFunctionName = process.env.PRODUCTS_EVENTS_FUNCTION_NAME!;

const ddbClient = new DynamoDB.DocumentClient();
const lambdaClient = new Lambda();

const productRepository = new ProductRepository(ddbClient, productsDdb);

export async function handler(event: APIGatewayProxyEvent, context: Context): Promise<APIGatewayProxyResult>{
    const lambdaRequestId = context.awsRequestId;
    const apiRequestRequestId = event.requestContext.requestId;
    
    console.log(`API Gateway RequestId: ${apiRequestRequestId} - Lambda RequestID: ${lambdaRequestId}`);

    const method = event.httpMethod;
    const resourceIsProducts = event.resource === '/products';
    const resourceIsProductsWithId = event.resource === '/products/{id}';

    if (resourceIsProducts) {
        const product = JSON.parse(event.body!) as Product 
        const productCreated = await productRepository.create(product);
        
        const response = await sendProductEvent(
            productCreated,
            ProductEventType.CREATED,
            'teste@gmail.com',
            lambdaRequestId
        );

        console.log(response);

        return {
            statusCode: 201,
            body: JSON.stringify(productCreated)
        };
    }else if (resourceIsProductsWithId) {
        const productId = event.pathParameters!.id as string; 
        console.log("Produto de ID:", productId);
        
        if (method === 'PUT') {
            try {
                const product = JSON.parse(event.body!) as Product
                const productUpdated = await productRepository.update(product, productId);
        
                const response = await sendProductEvent(
                    productUpdated,
                    ProductEventType.UPDATED,
                    'teste123@gmail.com',
                    lambdaRequestId
                );

                console.log(response);

                return {
                    statusCode: 200,
                    body: JSON.stringify(productUpdated)
                };
            } catch (ConditionCheckFailedException) {
                return {
                    statusCode: 404,
                    body: 'Product Not Found'
                };
            }
        }else {
            try {
                const productDeleted = await productRepository.delete(productId);

                const response = await sendProductEvent(
                    productDeleted,
                    ProductEventType.DELETED,
                    'teste456@gmail.com',
                    lambdaRequestId
                );

                console.log(response);

                return {
                    statusCode: 200,
                    body: JSON.stringify(productDeleted)
                };
            } catch (error) {
                console.log((<Error>error).message);
                return {
                    statusCode: 404,
                    body: (<Error>error).message
                };
            }
        }
    }

    return {
        statusCode: 400,
        body: JSON.stringify({ message: "BAD REQUEST" })
    };
}

function sendProductEvent(product: Product, eventType: ProductEventType, email: string, lambdaRequestId: string) {
    const event: ProductEvent = {
        email: email,
        eventType: eventType,
        productCode: product.code,
        productId: product.id,
        productPrice: product.price,
        requestId: lambdaRequestId
    };
    
    return lambdaClient.invoke({
        FunctionName: productsEventsFunctionName,
        Payload: JSON.stringify(event),
        InvocationType: 'Event'
    }).promise();
}