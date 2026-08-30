import { PrismaBookingTimelineRepository } from './prisma-booking-timeline.repository';

describe('PrismaBookingTimelineRepository',()=>{
  const findMany=jest.fn(); const repository=new PrismaBookingTimelineRepository({bookingTimelineEvent:{findMany}} as never);
  beforeEach(()=>jest.resetAllMocks());
  it('scopes by business and booking with deterministic keyset pagination',async()=>{const occurredAt=new Date('2026-08-29T18:00:00.000Z');const row={id:'event',businessId:'business',bookingId:'booking',type:'BOOKING_CANCELLED',occurredAt,actorUserId:null,details:{reason:'Motivo'}};findMany.mockResolvedValueOnce([row]);await expect(repository.list({businessId:'business',bookingId:'booking',before:{occurredAt,id:'event'},limit:51})).resolves.toEqual([row]);expect(findMany).toHaveBeenCalledWith({where:{businessId:'business',bookingId:'booking',OR:[{occurredAt:{lt:occurredAt}},{occurredAt,id:{lt:'event'}}]},orderBy:[{occurredAt:'desc'},{id:'desc'}],take:51,select:{id:true,businessId:true,bookingId:true,type:true,occurredAt:true,actorUserId:true,details:true}});});
});
