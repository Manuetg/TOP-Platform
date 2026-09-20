import { Module } from '@nestjs/common';
import { BusinessModule } from '../business/business.module';
import { IdentityModule } from '../identity/identity.module';
import { ResourceModule } from '../resource/resource.module';
import { ContactModule } from '../contact/contact.module';
import { BookingModule } from '../booking/booking.module';
import { SearchBusinessUseCase } from './application/search-business.use-case';
import { SearchController } from './presentation/search.controller';
@Module({ imports: [BusinessModule, IdentityModule, ResourceModule, ContactModule, BookingModule], providers: [SearchBusinessUseCase], controllers: [SearchController] })
export class SearchModule {}
