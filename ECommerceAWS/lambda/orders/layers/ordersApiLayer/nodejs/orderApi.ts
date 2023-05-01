export enum PaymentType {
    CASH = 'CASH',
    DEBIT_CARD = 'DEBIT_CARD',
    CREDIT_CARD = 'CREDIT_CARD'
}

export enum ShippingType {
    ECONOMIC = 'ECONOMIC',
    URGENT = 'URGENT'
}

export enum CarrierType {
    CORREIOS = 'CORREIOS',
    FEDEX = 'FEDEX'
}

export interface OrderRequest {
    email: string,
    productsId: string[],
    payment: PaymentType,
    shipping: {
        type: "URGERT" | "ECONOMIC";
        carrier: CarrierType
    }
}

export interface OrderProductResponse {
    code: string,
    price: number
}

export interface OrderResponse {
    email: string,
    id: string,
    createdAt: number,
    billing: {
        payment: PaymentType,
        totalPrice: number
    }
    products?: OrderProductResponse[],
    shipping: {
        type: ShippingType,
        carrier: CarrierType
    }
}