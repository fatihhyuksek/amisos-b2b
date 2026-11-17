// K-78: dashboard "geçen ayın aynı günlerine kadar" dönemi.
import { previousMonthToDate } from './dashboard.service.js';

describe('previousMonthToDate', () => {
  it('aynı gün numarasına kadar', () => {
    expect(previousMonthToDate('2030-06-15')).toEqual({ from: '2030-05-01', to: '2030-05-15' });
  });
  it('geçen ay daha kısaysa son güne kıstırır', () => {
    expect(previousMonthToDate('2030-05-31')).toEqual({ from: '2030-04-01', to: '2030-04-30' });
    expect(previousMonthToDate('2030-03-30')).toEqual({ from: '2030-02-01', to: '2030-02-28' });
    expect(previousMonthToDate('2032-03-31')).toEqual({ from: '2032-02-01', to: '2032-02-29' });
  });
  it('yıl başında geçen yılın Aralık ayı', () => {
    expect(previousMonthToDate('2030-01-10')).toEqual({ from: '2029-12-01', to: '2029-12-10' });
  });
});
