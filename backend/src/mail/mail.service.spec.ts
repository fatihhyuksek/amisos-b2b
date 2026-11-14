import { Logger } from '@nestjs/common';
import { DevMailService } from './mail.service.js';

const configFor = (env: string) => ({ get: () => env }) as never;

describe('DevMailService', () => {
  afterEach(() => vi.restoreAllMocks());

  it('K-39: token lu bağlantı yalnızca development/test te log a yazılır', async () => {
    const log = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    const warn = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => {});
    await new DevMailService(configFor('development')).sendPasswordReset(
      'a@b.co',
      'http://x/#/t?token=gizli',
    );
    expect(log).toHaveBeenCalledWith(expect.stringContaining('token=gizli'));
    log.mockClear();
    await new DevMailService(configFor('production')).sendPasswordReset(
      'a@b.co',
      'http://x/#/t?token=gizli',
    );
    expect(log).not.toHaveBeenCalled();
    expect(JSON.stringify(warn.mock.calls)).not.toContain('gizli');
  });
});
