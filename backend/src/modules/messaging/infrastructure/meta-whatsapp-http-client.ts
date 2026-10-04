import { Injectable } from '@nestjs/common';

export interface MetaWhatsAppHttpRequest {
  headers: Record<string, string>;
  body: string;
  signal: AbortSignal;
}

export interface MetaWhatsAppHttpResponse {
  status: number;
  body: unknown;
}

export interface MetaWhatsAppHttpClient {
  post(url: string, request: MetaWhatsAppHttpRequest): Promise<MetaWhatsAppHttpResponse>;
  get?(url: string, request: MetaWhatsAppHttpRequest): Promise<MetaWhatsAppHttpResponse>;
}

@Injectable()
export class FetchMetaWhatsAppHttpClient implements MetaWhatsAppHttpClient {
  async post(url: string, request: MetaWhatsAppHttpRequest): Promise<MetaWhatsAppHttpResponse> {
    const response = await fetch(url, { method: 'POST', headers: request.headers, ...(request.body === undefined ? {} : { body: request.body }), signal: request.signal });
    return this.readResponse(response);
  }

  async get(url: string, request: MetaWhatsAppHttpRequest): Promise<MetaWhatsAppHttpResponse> {
    const response = await fetch(url, { method: 'GET', headers: request.headers, signal: request.signal });
    return this.readResponse(response);
  }

  private async readResponse(response: Response): Promise<MetaWhatsAppHttpResponse> {
    let body: unknown = null;
    try {
      body = await response.json() as unknown;
    } catch {
      body = null;
    }
    return { status: response.status, body };
  }
}

