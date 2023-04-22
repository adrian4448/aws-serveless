import { Context, SNSEvent, SNSMessage } from 'aws-lambda';
import { AWSError, DynamoDB } from 'aws-sdk';
import { PromiseResult } from 'aws-sdk/lib/request';
import * as AWSXRay from 'aws-xray-sdk';
import { Envelope, OrderEvent } from '/opt/nodejs/orderEventsLayer';
import { OrderEventDdb, OrdersEventRepository } from '/opt/nodejs/orderEventsRepositoryLayer';

AWSXRay.captureAWS(require('aws-sdk'));

const eventsDdb = process.env.EVENTS_DDB!;

const ddbClient = new DynamoDB.DocumentClient();
const orderEventsRepository = new OrdersEventRepository(ddbClient, eventsDdb);

export async function handler(event: SNSEvent, context: Context): Promise<void> {
    const promises: Promise<PromiseResult<DynamoDB.DocumentClient.PutItemOutput, AWSError>>[] = [];
    event.Records.forEach((record) => {
        promises.push(createEvent(record.Sns));
    });

    Promise.all(promises);
    return;
}

function createEvent(body: SNSMessage) {
    const envelope = JSON.parse(body.Message) as Envelope;
    const event = JSON.parse(envelope.data) as OrderEvent;
    
    console.log(
        `Order Event - MessageId: ${body.MessageId}`
    );

    const timestamp = Date.now();
    const ttl = ~~(timestamp / 1000 + 5 * 60);

    const orderEventDdb: OrderEventDdb = {
        pk: `#order_${event.id}`,
        sk: `${envelope.eventType}#${timestamp}`,
        email: event.email,
        createdAt: timestamp,
        eventType: envelope.eventType,
        requestId: event.requestId,
        info: {
            messageId: body.MessageId,
            orderId: event.id,
            productCodes: event.productsCodes
        },
        ttl: ttl
    };

    return orderEventsRepository.createOrderEvent(orderEventDdb);
}