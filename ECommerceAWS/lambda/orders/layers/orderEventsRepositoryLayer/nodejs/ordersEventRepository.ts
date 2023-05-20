import { DocumentClient } from "aws-sdk/clients/dynamodb";

export interface OrderEventDdb {
    pk: string;
    sk: string;
    email: string;
    createdAt: number;
    requestId: string;
    eventType: string;
    info: {
        orderId: string;
        productCodes: string[];
        messageId: string;
    };
    ttl: number;
}

export class OrdersEventRepository {
    private ddbClient: DocumentClient;
    private eventsDdb: string;

    constructor(ddbClient: DocumentClient, eventsDdb: string) {
        this.ddbClient = ddbClient;
        this.eventsDdb = eventsDdb;
    }

    createOrderEvent(orderEvent: OrderEventDdb) {
        return this.ddbClient.put({
            TableName: this.eventsDdb,
            Item: orderEvent
        }).promise();
    }

    async getOrderEventsByEmail(email: string) {
        const data = await this.ddbClient.query({
            TableName: this.eventsDdb,
            IndexName: 'emailIndex',
            KeyConditionExpression: 'email = :email AND begins_with(sk, :prefix)',
            ExpressionAttributeValues: {
                ':email': email,
                ':prefix': 'ORDER_'
            }
        }).promise();

        return data.Items as OrderEventDdb[];
    }
}