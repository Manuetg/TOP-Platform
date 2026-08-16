import { Inject, Injectable } from '@nestjs/common';
import { BUSINESS_REPOSITORY, type BusinessRepository } from '../../business/business.contract';
import { RATE_PLAN_REPOSITORY, type RatePlanRepository } from '../domain/rate-plan.repository';
import { SeasonalRate } from '../domain/seasonal-rate.entity';
import { SEASONAL_RATE_REPOSITORY, type SeasonalRateRepository } from '../domain/seasonal-rate.repository';
import { InvalidSeasonalRateInputError, SeasonalRateBusinessNotFoundError, SeasonalRatePlanNotFoundError } from './seasonal-rate.errors';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
@Injectable() export class ListSeasonalRatesUseCase { constructor(@Inject(BUSINESS_REPOSITORY)private readonly businesses:BusinessRepository,@Inject(RATE_PLAN_REPOSITORY)private readonly plans:RatePlanRepository,@Inject(SEASONAL_RATE_REPOSITORY)private readonly seasons:SeasonalRateRepository){} async execute(businessId:string,ratePlanId:string):Promise<SeasonalRate[]>{if(!uuid.test(businessId))throw new InvalidSeasonalRateInputError('El identificador del negocio no es válido.');if(!uuid.test(ratePlanId))throw new InvalidSeasonalRateInputError('El identificador de la tarifa no es válido.');if(!await this.businesses.findById(businessId))throw new SeasonalRateBusinessNotFoundError('El negocio no existe.');if(!await this.plans.findByIdAndBusinessId(ratePlanId,businessId))throw new SeasonalRatePlanNotFoundError('La tarifa no existe.');return this.seasons.listByRatePlanId(ratePlanId);} }
