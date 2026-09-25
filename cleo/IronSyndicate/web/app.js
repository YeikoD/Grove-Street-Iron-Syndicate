const fill = document.getElementById('fill');
const slider = document.getElementById('slider');
const clock = document.getElementById('clock');
const button = document.getElementById('button');
const actionText = document.getElementById('actionText');

function update() {
  clock.textContent = new Date().toLocaleTimeString('es-AR', { hour12: false });
  document.getElementById('fps').textContent = 'FRAME ' + new Date().getSeconds();
}

function setProgress(value) {
  fill.style.width = value + '%';
}

slider.addEventListener('input', e => {
  setProgress(e.target.value);
  actionText.textContent = 'Slider: ' + e.target.value + '%';
});

button.addEventListener('click', () => {
  const value = Math.floor(Math.random() * 100);
  slider.value = value;
  setProgress(value);
  actionText.textContent = 'Botón OK: ' + value + '%';
});

setInterval(update, 1000);
setInterval(() => {
  if (!document.activeElement || document.activeElement.tagName !== 'INPUT') {
    const next = (Number(slider.value) + 1) % 101;
    slider.value = next;
    setProgress(next);
  }
}, 1200);

update();
setProgress(slider.value);
