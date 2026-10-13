import source from './data-source';

// Historical Phase5/6 rollback checks need their six-migration baseline.
// Never point this CLI-only configuration at the full product/test/manual DB.
if (process.env.NODE_ENV !== 'test' || process.env.DB_NAME !== 'VIntern_Rollback_E2E') {
  throw new Error('Legacy rollback is restricted to the dedicated disposable CI database.');
}
const migrations = source.options.migrations;
if (!Array.isArray(migrations) || migrations.length < 6 ||
  typeof migrations[5] !== 'function' ||
  migrations[5].name !== 'CreateAiMentorAssistanceRecommendationTables1760304000000') {
  throw new Error('Unexpected legacy migration baseline; review ordering before rollback.');
}
source.setOptions({ migrations: migrations.slice(0, 6), synchronize: false });
export default source;
