// Гипотеза 1: можно ли читать/писать системный буфер из Electron без нативной сборки.
// Запускается внутри Electron main process.
const { app, clipboard } = require('electron');

app.whenReady().then(() => {
  const original = clipboard.readText();
  console.log('READ_OK:', JSON.stringify(original).slice(0, 80));

  const testValue = 'copybridge-test-' + Date.now();
  clipboard.writeText(testValue);
  const readBack = clipboard.readText();

  console.log('WRITE_OK:', readBack === testValue);

  // восстановим исходное значение
  clipboard.writeText(original);

  // проверим polling-подход (чтение каждые 300мс)
  let last = clipboard.readText();
  let ticks = 0;
  const interval = setInterval(() => {
    const now = clipboard.readText();
    if (now !== last) {
      console.log('CHANGE_DETECTED:', JSON.stringify(now).slice(0, 40));
      last = now;
    }
    ticks++;
    if (ticks >= 6) {
      clearInterval(interval);
      console.log('POLL_OK ticks=' + ticks);
      app.quit();
    }
  }, 300);
});
