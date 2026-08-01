module.exports = {
  options: {
    doNotFollow: {
      path: '(^|[\\\\/])node_modules([\\\\/]|$)'
    },
    exclude: {
      path: '(^|[\\\\/])(node_modules|dist|coverage|generated|\.stryker-tmp|reports|tmp|temp)([\\\\/]|$)|(^|[\\\\/])prisma[\\\\/]generated([\\\\/]|$)'
    }
  },
  forbidden: [
    { name: 'no-circular', severity: 'error', from: {}, to: { circular: true } },
    { name: 'domain-no-infrastructure', severity: 'error', from: { path: '^src/modules/.+/domain' }, to: { path: '^src/modules/.+/infrastructure' } },
    { name: 'domain-no-nestjs', severity: 'error', from: { path: '^src/modules/.+/domain' }, to: { dependencyTypes: ['npm'], path: '^@nestjs/' } },
    { name: 'domain-no-prisma', severity: 'error', from: { path: '^src/modules/.+/domain' }, to: { dependencyTypes: ['npm'], path: '^@prisma/' } },
    { name: 'presentation-no-prisma', severity: 'error', from: { path: '^src/modules/.+/presentation' }, to: { path: 'prisma|@prisma' } },
    { name: 'domain-no-application', severity: 'error', from: { path: '^src/modules/.+/domain' }, to: { path: '^src/modules/.+/application' } },
    { name: 'no-private-cross-module', severity: 'error', from: { path: '^src/modules/([^/]+)' }, to: { path: '^src/modules/(?!$1)[^/]+/(?:domain|infrastructure)' } }
  ]
};
