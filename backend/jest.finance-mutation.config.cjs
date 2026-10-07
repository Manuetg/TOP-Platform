// Propuesta staging: aplicar sólo tras revisar el freeze final. No ejecutar desde esta carpeta.
module.exports = {
  ...require('./jest.mutation.config.cjs'),
  testMatch: [
      "**/modules/finance/**/*.spec.ts",
      "**/modules/payment/infrastructure/prisma-finance-payment.reader.spec.ts",
      "**/modules/dashboard/application/get-business-dashboard.use-case.spec.ts",
      "**/modules/dashboard/application/get-revenue-kpi.use-case.spec.ts",
      "**/modules/dashboard/presentation/dashboard.controller.spec.ts",
      "**/modules/business/infrastructure/prisma-business-change.repository.spec.ts",
      "**/modules/payment/domain/payment-adjustment.rules.spec.ts",
      "**/modules/payment/application/get-outstanding-balance.use-case.spec.ts",
      "**/modules/payment/application/payment-plan.use-cases.spec.ts",
      "**/modules/payment/application/register-payment.use-case.spec.ts",
      "**/modules/payment/application/list-payments.use-case.spec.ts",
      "**/modules/payment/infrastructure/prisma-payment-adjustment.writer.spec.ts",
      "**/modules/payment/infrastructure/prisma-payment-effective.reader.spec.ts",
      "**/modules/payment/infrastructure/prisma-payment-closing.reader.spec.ts",
      "**/modules/payment/infrastructure/prisma-payment-plan.repository.spec.ts",
      "**/modules/payment/infrastructure/prisma-payment.repository.spec.ts",
      "**/modules/pricing/domain/terminal-final-amount.spec.ts",
      "**/modules/pricing/infrastructure/prisma-current-pricing.reader.spec.ts",
      "**/modules/pricing/infrastructure/prisma-current-pricing.reader.v2.spec.ts",
      "**/modules/payment/infrastructure/prisma-outstanding-balance.repository.spec.ts",
      "**/modules/pricing/infrastructure/prisma-terminal-final-amount.writer.spec.ts"
  ],
};
