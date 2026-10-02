import { BookingTimelineEventType } from './booking-timeline-event';
describe('BookingTimelineEvent',()=>{it('defines only approved event types',()=>expect(Object.values(BookingTimelineEventType)).toEqual(['BOOKING_CREATED','BOOKING_SUBMITTED','BOOKING_CONFIRMED','BOOKING_CANCELLED','BOOKING_CHECKED_IN','BOOKING_CHECKED_OUT','BOOKING_MARKED_NO_SHOW']));});
