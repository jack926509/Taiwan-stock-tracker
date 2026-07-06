import assert from "node:assert/strict";
import { test } from "node:test";
import { aggregateCandles } from "../lib/aggregateKline.ts";

function candle(date, i) {
  return {
    date,
    open: 100 + i,
    high: 101 + i,
    low: 99 + i,
    close: 100 + i,
    volume: 1000 + i,
  };
}

test("empty input returns empty array", () => {
  assert.deepEqual(aggregateCandles([], "week"), []);
  assert.deepEqual(aggregateCandles([], "month"), []);
});

test("single day input returns a single aggregated candle matching the input", () => {
  const candles = [candle("2026-06-10", 0)];

  const week = aggregateCandles(candles, "week");
  assert.equal(week.length, 1);
  assert.deepEqual(week[0], candles[0]);

  const month = aggregateCandles(candles, "month");
  assert.equal(month.length, 1);
  assert.deepEqual(month[0], candles[0]);
});

test("week aggregation groups by ISO week across a year boundary without splitting", () => {
  // 2020-12-28（一）～2021-01-03（日）同屬 ISO 2020-W53；2021-01-04（一）另起 2021-W01
  const candles = [
    candle("2020-12-28", 0),
    candle("2020-12-29", 1),
    candle("2020-12-30", 2),
    candle("2020-12-31", 3),
    candle("2021-01-01", 4),
    candle("2021-01-02", 5),
    candle("2021-01-03", 6),
    candle("2021-01-04", 7),
    candle("2021-01-05", 8),
  ];

  const weeks = aggregateCandles(candles, "week");
  assert.equal(weeks.length, 2);

  const [w53, w01] = weeks;
  assert.equal(w53.date, "2021-01-03");
  assert.equal(w53.open, candles[0].open);
  assert.equal(w53.close, candles[6].close);
  assert.equal(w53.high, Math.max(...candles.slice(0, 7).map((c) => c.high)));
  assert.equal(w53.low, Math.min(...candles.slice(0, 7).map((c) => c.low)));
  assert.equal(
    w53.volume,
    candles.slice(0, 7).reduce((s, c) => s + c.volume, 0)
  );

  assert.equal(w01.date, "2021-01-05");
  assert.equal(w01.open, candles[7].open);
  assert.equal(w01.close, candles[8].close);
});

test("week aggregation keeps a partial (incomplete) trailing week as its own group", () => {
  // 只給週一、週二兩天（同一週的殘段），應合成一根，不因不足 5 個交易日而被丟棄
  const candles = [candle("2026-06-01", 0), candle("2026-06-02", 1)];

  const weeks = aggregateCandles(candles, "week");
  assert.equal(weeks.length, 1);
  assert.equal(weeks[0].open, candles[0].open);
  assert.equal(weeks[0].close, candles[1].close);
  assert.equal(weeks[0].volume, candles[0].volume + candles[1].volume);
});

test("month aggregation groups by calendar month and keeps a partial trailing month", () => {
  const candles = [
    candle("2026-01-30", 0),
    candle("2026-01-31", 1),
    candle("2026-02-02", 2),
    candle("2026-02-03", 3),
    candle("2026-02-04", 4),
    candle("2026-03-02", 5), // 殘段：3 月只有這一天
  ];

  const months = aggregateCandles(candles, "month");
  assert.equal(months.length, 3);

  const [jan, feb, mar] = months;
  assert.equal(jan.date, "2026-01-31");
  assert.equal(jan.open, candles[0].open);
  assert.equal(jan.close, candles[1].close);
  assert.equal(jan.high, Math.max(candles[0].high, candles[1].high));
  assert.equal(jan.low, Math.min(candles[0].low, candles[1].low));
  assert.equal(jan.volume, candles[0].volume + candles[1].volume);

  assert.equal(feb.date, "2026-02-04");
  assert.equal(feb.open, candles[2].open);
  assert.equal(feb.close, candles[4].close);
  assert.equal(
    feb.volume,
    candles[2].volume + candles[3].volume + candles[4].volume
  );

  assert.equal(mar.date, "2026-03-02");
  assert.deepEqual(mar, candles[5]);
});
