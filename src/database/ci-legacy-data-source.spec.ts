describe('Legacy rollback datasource safety', () => {
  const initialName = process.env.DB_NAME;
  const initialMode = process.env.NODE_ENV;
  const setOptions = jest.fn();
  function load(lastName = 'CreateAiMentorAssistanceRecommendationTables1760304000000') {
    const last = { [lastName]: class {} }[lastName];
    const migrations = [...Array.from({ length: 5 }, () => class {}), last, class LaterMigration {}];
    jest.doMock('./data-source', () => ({ __esModule: true, default: { options: { migrations }, setOptions } }));
    jest.isolateModules(() => { jest.requireActual('./ci-legacy-data-source'); });
  }
  beforeEach(() => { setOptions.mockClear(); process.env.NODE_ENV = 'test'; process.env.DB_NAME = 'VIntern_Rollback_E2E'; });
  afterEach(() => {
    if (initialName === undefined) delete process.env.DB_NAME; else process.env.DB_NAME = initialName;
    if (initialMode === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = initialMode;
    jest.dontMock('./data-source');
  });
  it('rejects the regular product/E2E database without changing options', () => {
    process.env.DB_NAME = 'VIntern_M5_E2E';
    expect(() => load()).toThrow('dedicated disposable CI database');
    expect(setOptions).not.toHaveBeenCalled();
  });
  it('rejects production mode even for the dedicated name', () => {
    process.env.NODE_ENV = 'production';
    expect(() => load()).toThrow('dedicated disposable CI database');
    expect(setOptions).not.toHaveBeenCalled();
  });
  it('rejects a changed migration baseline', () => {
    expect(() => load('UnexpectedMigration')).toThrow('Unexpected legacy migration baseline');
    expect(setOptions).not.toHaveBeenCalled();
  });
  it('selects only the six historical migrations with synchronization disabled', () => {
    load();
    expect(setOptions).toHaveBeenCalledWith({ migrations: expect.any(Array), synchronize: false });
    expect(setOptions.mock.calls[0][0].migrations).toHaveLength(6);
  });
});
