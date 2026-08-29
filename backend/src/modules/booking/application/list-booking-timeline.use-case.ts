import { Inject, Injectable } from '@nestjs/common';
import { BOOKING_TIMELINE_REPOSITORY, type BookingTimelineEvent, type BookingTimelineRepository } from '../booking.contract';
import { BOOKING_REPOSITORY, type BookingRepository } from '../domain/booking.repository';
import { BookingNotFoundError, InvalidBookingInputError } from './booking.errors';
import { requireBookingUuid } from './booking.validation';

export interface BookingTimelinePage { items: BookingTimelineEvent[]; pageInfo: { nextCursor: string | null; hasNextPage: boolean } }

@Injectable()
export class ListBookingTimelineUseCase {
  constructor(@Inject(BOOKING_REPOSITORY) private readonly bookings: BookingRepository, @Inject(BOOKING_TIMELINE_REPOSITORY) private readonly timeline: BookingTimelineRepository) {}
  async execute(input:{businessId:unknown;bookingId:unknown;cursor?:unknown;limit?:unknown}):Promise<BookingTimelinePage> {
    const businessId=requireBookingUuid(input.businessId,'El identificador del negocio no es válido.');
    const bookingId=requireBookingUuid(input.bookingId,'El identificador de la reserva no es válido.');
    if (!(await this.bookings.findByIdAndBusinessId(bookingId,businessId))) throw new BookingNotFoundError('La reserva no existe.');
    const limit=this.limit(input.limit); const before=this.cursor(input.cursor);
    const rows=await this.timeline.list({businessId,bookingId,before,limit:limit+1});
    const hasNextPage=rows.length>limit; const items=rows.slice(0,limit); const last=items.at(-1);
    return {items,pageInfo:{hasNextPage,nextCursor:hasNextPage&&last?this.encode(last.occurredAt,last.id):null}};
  }
  private limit(value:unknown):number { if(value===undefined)return 50; const parsed=typeof value==='string'?Number(value):value; if(!Number.isInteger(parsed)||Number(parsed)<1||Number(parsed)>50)throw new InvalidBookingInputError('El límite debe ser un entero entre 1 y 50.'); return Number(parsed); }
  private cursor(value:unknown):{occurredAt:Date;id:string}|null { if(value===undefined)return null; if(typeof value!=='string'||value.length===0)throw new InvalidBookingInputError('El cursor no es válido.'); try{const decoded=JSON.parse(Buffer.from(value,'base64url').toString('utf8')) as {occurredAt?:unknown;id?:unknown}; const id=requireBookingUuid(decoded.id,'El cursor no es válido.'); if(typeof decoded.occurredAt!=='string')throw new Error(); const occurredAt=new Date(decoded.occurredAt); if(Number.isNaN(occurredAt.getTime()))throw new Error(); return {occurredAt,id};}catch{throw new InvalidBookingInputError('El cursor no es válido.');} }
  private encode(occurredAt:Date,id:string):string{return Buffer.from(JSON.stringify({occurredAt:occurredAt.toISOString(),id}),'utf8').toString('base64url');}
}
