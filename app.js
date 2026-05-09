// ─── CONFIG ──────────────────────────────────────────────────────────────────
const SHEET_URL = 'https://script.google.com/macros/s/AKfycbyJN12lGSlzwZRPTcBaHXvzgnsyrRfBPiO-4yZwAlYBy9NRT1PsNwazJX4ZC65U4jYJFA/exec';

// ─── HELPERS ─────────────────────────────────────────────────────────────────
const genId = () => Date.now().toString(36) + Math.random().toString(36).substr(2);
const today = () => new Date().toISOString().split('T')[0];

// ─── STATE ───────────────────────────────────────────────────────────────────
let currentKelasId = null;
let navBackTarget = null;

// Cache data lokal agar tidak sering fetch
let cache = { kelas: null, siswa: null, absensi: null };

// ─── API LAYER ───────────────────────────────────────────────────────────────
async function apiGet(sheet) {
  const res = await fetch(`${SHEET_URL}?sheet=${sheet}`);
  if (!res.ok) throw new Error(`Gagal mengambil data ${sheet}`);
  return await res.json();
}

async function apiPost(sheet, data) {
  const res = await fetch(SHEET_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sheet, data })
  });
  if (!res.ok) throw new Error(`Gagal menyimpan data ${sheet}`);
  return await res.json();
}

async function apiDelete(sheet, id) {
  const res = await fetch(SHEET_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sheet, id, action: 'delete' })
  });
  if (!res.ok) throw new Error(`Gagal menghapus data ${sheet}`);
  return await res.json();
}

async function apiDeleteMany(sheet, ids) {
  for (const id of ids) {
    await apiDelete(sheet, id);
  }
}

// ─── CACHE HELPERS ───────────────────────────────────────────────────────────
async function getData(key) {
  if (cache[key] !== null) return cache[key];
  showLoading(true);
  try {
    cache[key] = await apiGet(key);
    return cache[key];
  } finally {
    showLoading(false);
  }
}

function invalidateCache(...keys) {
  keys.forEach(k => { cache[k] = null; });
}

// ─── LOADING ─────────────────────────────────────────────────────────────────
function showLoading(show) {
  let el = document.getElementById('global-loading');
  if (!el) {
    el = document.createElement('div');
    el.id = 'global-loading';
    el.style.cssText = `
      position: fixed; top: 0; left: 0; width: 100%; height: 3px;
      background: linear-gradient(90deg, #6c63ff, #a78bfa);
      z-index: 9999; transition: opacity 0.3s;
    `;
    document.body.appendChild(el);
  }
  el.style.opacity = show ? '1' : '0';
  el.style.display = show ? 'block' : 'none';
}

// ─── NAVIGATION ──────────────────────────────────────────────────────────────
function goPage(pageId, backLabel = null, backTarget = 'page-dashboard') {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById(pageId).classList.add('active');
  const back = document.getElementById('navBack');
  if (backLabel) {
    back.textContent = '← ' + backLabel;
    back.classList.add('show');
    navBackTarget = backTarget;
  } else {
    back.classList.remove('show');
    navBackTarget = null;
  }
  window.scrollTo(0, 0);
}

function navBackAction() {
  if (navBackTarget) goPage(navBackTarget);
  renderDashboard();
}

function goHome() {
  goPage('page-dashboard');
  renderDashboard();
}

// ─── TOAST ───────────────────────────────────────────────────────────────────
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2500);
}

function showError(msg) {
  showToast('❌ ' + msg);
  console.error(msg);
}

// ─── MODAL ───────────────────────────────────────────────────────────────────
function showModal(id) { document.getElementById(id).classList.add('show'); }
function hideModal(id) { document.getElementById(id).classList.remove('show'); }

document.querySelectorAll('.modal-overlay').forEach(m => {
  m.addEventListener('click', e => { if (e.target === m) m.classList.remove('show'); });
});

// ─── KELAS ───────────────────────────────────────────────────────────────────
async function tambahKelas() {
  const nama = document.getElementById('input-nama-kelas').value.trim();
  const mapel = document.getElementById('input-mapel').value.trim();
  if (!nama) return alert('Nama kelas wajib diisi');

  try {
    showLoading(true);
    await apiPost('kelas', { id: genId(), nama, mapel });
    invalidateCache('kelas');

    document.getElementById('input-nama-kelas').value = '';
    document.getElementById('input-mapel').value = '';
    hideModal('modal-tambah-kelas');
    await renderDashboard();
    showToast('Kelas berhasil ditambahkan ✓');
  } catch (e) {
    showError('Gagal menambah kelas: ' + e.message);
  } finally {
    showLoading(false);
  }
}

async function hapusKelas() {
  if (!confirm('Hapus kelas ini beserta semua data siswa dan absensinya?')) return;

  try {
    showLoading(true);
    const [siswaAll, absensiAll] = await Promise.all([getData('siswa'), getData('absensi')]);

    const siswaIds = siswaAll.filter(s => s.kelasId === currentKelasId).map(s => s.id);
    const absenIds = absensiAll.filter(a => a.kelasId === currentKelasId).map(a => a.id);

    await apiDelete('kelas', currentKelasId);
    await apiDeleteMany('siswa', siswaIds);
    await apiDeleteMany('absensi', absenIds);

    invalidateCache('kelas', 'siswa', 'absensi');
    showToast('Kelas dihapus');
    goHome();
  } catch (e) {
    showError('Gagal menghapus kelas: ' + e.message);
  } finally {
    showLoading(false);
  }
}

async function bukaKelas(kelasId) {
  currentKelasId = kelasId;
  try {
    const kelas = (await getData('kelas')).find(k => k.id === kelasId);
    document.getElementById('kelas-title').textContent = kelas.nama;
    document.getElementById('kelas-sub').textContent = kelas.mapel || 'Tap absensi untuk mulai';
    await renderSiswa();
    goPage('page-kelas', 'Dashboard');
  } catch (e) {
    showError('Gagal membuka kelas: ' + e.message);
  }
}

// ─── SISWA ───────────────────────────────────────────────────────────────────
async function tambahSiswa() {
  const nama = document.getElementById('input-nama-siswa').value.trim();
  if (!nama) return alert('Nama siswa wajib diisi');

  try {
    showLoading(true);
    await apiPost('siswa', { id: genId(), nama, kelasId: currentKelasId });
    invalidateCache('siswa');

    document.getElementById('input-nama-siswa').value = '';
    hideModal('modal-tambah-siswa');
    await renderSiswa();
    showToast('Siswa berhasil ditambahkan ✓');
  } catch (e) {
    showError('Gagal menambah siswa: ' + e.message);
  } finally {
    showLoading(false);
  }
}

async function hapusSiswa(siswaId) {
  if (!confirm('Hapus siswa ini?')) return;
  try {
    showLoading(true);
    const absensiAll = await getData('absensi');
    const absenIds = absensiAll.filter(a => a.siswaId === siswaId).map(a => a.id);

    await apiDelete('siswa', siswaId);
    await apiDeleteMany('absensi', absenIds);

    invalidateCache('siswa', 'absensi');
    await renderSiswa();
    showToast('Siswa dihapus');
  } catch (e) {
    showError('Gagal menghapus siswa: ' + e.message);
  } finally {
    showLoading(false);
  }
}

async function renderSiswa() {
  const siswa = (await getData('siswa')).filter(s => s.kelasId === currentKelasId);
  const el = document.getElementById('list-siswa');

  if (!siswa.length) {
    el.innerHTML = `
      <div class="empty">
        <div class="empty-icon">👤</div>
        <div class="empty-text">Belum ada siswa</div>
        <div class="empty-sub">Tap tombol Tambah untuk menambah siswa</div>
      </div>`;
    return;
  }

  el.innerHTML = siswa.map((s, i) => `
    <div class="siswa-item">
      <div class="siswa-avatar">${s.nama.charAt(0).toUpperCase()}</div>
      <div class="siswa-nama"><span class="siswa-no">${i + 1}.</span>${s.nama}</div>
      <button class="btn btn-danger btn-sm" onclick="hapusSiswa('${s.id}')">✕</button>
    </div>
  `).join('');
}

// ─── ABSENSI ─────────────────────────────────────────────────────────────────
async function goAbsen() {
  const siswa = (await getData('siswa')).filter(s => s.kelasId === currentKelasId);
  if (!siswa.length) return alert('Tambah siswa dulu sebelum absensi');

  const kelas = (await getData('kelas')).find(k => k.id === currentKelasId);
  document.getElementById('absen-info').textContent = kelas.nama + (kelas.mapel ? ' · ' + kelas.mapel : '');
  document.getElementById('absen-tanggal').value = today();
  await renderAbsenForm();
  goPage('page-absen', kelas.nama);
}

async function renderAbsenForm() {
  const siswa = (await getData('siswa')).filter(s => s.kelasId === currentKelasId);
  const el = document.getElementById('absen-list');

  el.innerHTML = siswa.map((s, i) => `
    <div class="absen-row hadir" id="row-${s.id}">
      <div class="absen-top">
        <div class="absen-number">${i + 1}</div>
        <div class="absen-nama">${s.nama}</div>
      </div>
      <div class="status-group">
        ${['Hadir', 'Sakit', 'Izin', 'Alfa'].map(st => `
          <button class="status-btn ${st === 'Hadir' ? 'active-hadir' : ''}"
            onclick="setStatus('${s.id}', '${st.toLowerCase()}')"
            id="btn-${s.id}-${st.toLowerCase()}">${st}</button>
        `).join('')}
      </div>
      <div class="keterangan-input" id="ket-${s.id}">
        <input type="text" placeholder="Keterangan (opsional)" id="ket-input-${s.id}" />
      </div>
    </div>
  `).join('');
}

function setStatus(siswaId, status) {
  document.getElementById('row-' + siswaId).className = 'absen-row ' + status;

  ['hadir', 'sakit', 'izin', 'alfa'].forEach(s => {
    const btn = document.getElementById(`btn-${siswaId}-${s}`);
    btn.className = 'status-btn' + (s === status ? ` active-${s}` : '');
  });

  const ket = document.getElementById('ket-' + siswaId);
  status !== 'hadir' ? ket.classList.add('show') : ket.classList.remove('show');
}

async function simpanAbsen() {
  const tanggal = document.getElementById('absen-tanggal').value;
  if (!tanggal) return alert('Pilih tanggal absensi');

  try {
    showLoading(true);
    const siswa = (await getData('siswa')).filter(s => s.kelasId === currentKelasId);

    // Hapus absensi lama untuk tanggal+kelas yang sama
    const absensiAll = await getData('absensi');
    const absenLamaIds = absensiAll
      .filter(a => a.kelasId === currentKelasId && a.tanggal === tanggal)
      .map(a => a.id);
    await apiDeleteMany('absensi', absenLamaIds);

    // Simpan absensi baru satu per satu
    for (const s of siswa) {
      const status = ['hadir', 'sakit', 'izin', 'alfa'].find(st =>
        document.getElementById(`btn-${s.id}-${st}`)?.classList.contains(`active-${st}`)
      ) || 'hadir';
      const keterangan = document.getElementById(`ket-input-${s.id}`)?.value || '';
      await apiPost('absensi', {
        id: genId(),
        siswaId: s.id,
        kelasId: currentKelasId,
        tanggal,
        status,
        keterangan
      });
    }

    invalidateCache('absensi');
    showToast('Absensi berhasil disimpan ✓');
    await bukaKelas(currentKelasId);
  } catch (e) {
    showError('Gagal menyimpan absensi: ' + e.message);
  } finally {
    showLoading(false);
  }
}

// ─── REKAP ───────────────────────────────────────────────────────────────────
async function goRekapKelas() {
  await renderRekapPage(currentKelasId);
}

async function renderRekapPage(kelasId = '') {
  const filterKelas = document.getElementById('rekap-filter-kelas');
  const kelas = await getData('kelas');
  filterKelas.innerHTML = '<option value="">Semua Kelas</option>' +
    kelas.map(k => `<option value="${k.id}" ${k.id === kelasId ? 'selected' : ''}>${k.nama}</option>`).join('');
  document.getElementById('rekap-filter-tanggal').value = '';
  goPage('page-rekap', 'Dashboard');
  await renderRekap();
}

async function renderRekap() {
  try {
    showLoading(true);
    const kelasId = document.getElementById('rekap-filter-kelas').value;
    const tanggal = document.getElementById('rekap-filter-tanggal').value;
    const [siswaAll, kelasAll, absensiRaw] = await Promise.all([
      getData('siswa'), getData('kelas'), getData('absensi')
    ]);

    let absensi = absensiRaw;
    if (kelasId) absensi = absensi.filter(a => a.kelasId === kelasId);
    if (tanggal) absensi = absensi.filter(a => a.tanggal === tanggal);

    const counts = { hadir: 0, sakit: 0, izin: 0, alfa: 0 };
    absensi.forEach(a => { if (counts[a.status] !== undefined) counts[a.status]++; });

    const statsEl = document.getElementById('rekap-stats');
    if (absensi.length) {
      statsEl.style.display = 'grid';
      statsEl.innerHTML = `
        <div class="stat-card stat-hadir"><div class="stat-num">${counts.hadir}</div><div class="stat-label">Hadir</div></div>
        <div class="stat-card stat-sakit"><div class="stat-num">${counts.sakit}</div><div class="stat-label">Sakit</div></div>
        <div class="stat-card stat-izin"><div class="stat-num">${counts.izin}</div><div class="stat-label">Izin</div></div>
        <div class="stat-card stat-alfa"><div class="stat-num">${counts.alfa}</div><div class="stat-label">Alfa</div></div>
      `;
    } else {
      statsEl.style.display = 'none';
    }

    const el = document.getElementById('rekap-content');
    if (!absensi.length) {
      el.innerHTML = `
        <div class="empty">
          <div class="empty-icon">📋</div>
          <div class="empty-text">Belum ada data absensi</div>
          <div class="empty-sub">Mulai absensi dari halaman kelas</div>
        </div>`;
      return;
    }

    const sorted = [...absensi].sort((a, b) => b.tanggal.localeCompare(a.tanggal));
    el.innerHTML = `
      <table class="rekap-table">
        <thead><tr>
          <th>Tanggal</th><th>Kelas</th><th>Siswa</th><th>Status</th><th>Keterangan</th>
        </tr></thead>
        <tbody>
          ${sorted.map(a => {
            const siswa = siswaAll.find(s => s.id === a.siswaId);
            const kelas = kelasAll.find(k => k.id === a.kelasId);
            const tgl = new Date(a.tanggal).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
            return `<tr>
              <td>${tgl}</td>
              <td>${kelas?.nama || '-'}</td>
              <td>${siswa?.nama || '-'}</td>
              <td><span class="badge badge-${a.status}">${a.status.charAt(0).toUpperCase() + a.status.slice(1)}</span></td>
              <td>${a.keterangan || '-'}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>`;
  } catch (e) {
    showError('Gagal memuat rekap: ' + e.message);
  } finally {
    showLoading(false);
  }
}

// ─── DASHBOARD ───────────────────────────────────────────────────────────────
async function renderDashboard() {
  const el = document.getElementById('list-kelas-dashboard');
  el.innerHTML = `<div class="empty"><div class="empty-icon">⏳</div><div class="empty-text">Memuat data...</div></div>`;

  try {
    invalidateCache('kelas', 'siswa', 'absensi');
    const [kelas, siswaAll, absensiAll] = await Promise.all([
      getData('kelas'), getData('siswa'), getData('absensi')
    ]);

    if (!kelas.length) {
      el.innerHTML = `
        <div class="empty">
          <div class="empty-icon">📚</div>
          <div class="empty-text">Belum ada kelas</div>
          <div class="empty-sub">Tap tombol Tambah Kelas untuk memulai</div>
        </div>`;
    } else {
      el.innerHTML = kelas.map(k => {
        const jmlSiswa = siswaAll.filter(s => s.kelasId === k.id).length;
        const sudahAbsen = absensiAll.some(a => a.kelasId === k.id && a.tanggal === today());
        return `
          <div class="kelas-card" onclick="bukaKelas('${k.id}')">
            <div class="kelas-icon">📖</div>
            <div class="kelas-info">
              <div class="kelas-nama">${k.nama}</div>
              <div class="kelas-meta">${k.mapel ? k.mapel + ' · ' : ''}${jmlSiswa} siswa${sudahAbsen ? ' · ✅ Sudah absen hari ini' : ''}</div>
            </div>
            <div class="kelas-arrow">›</div>
          </div>`;
      }).join('');
    }

    const rekapEl = document.getElementById('dashboard-rekap-info');
    const totalAbsen = absensiAll.filter(a => a.tanggal === today()).length;
    if (totalAbsen) {
      rekapEl.innerHTML = `<div class="alert alert-success">✅ ${totalAbsen} siswa sudah diabsensi hari ini. <span style="cursor:pointer;text-decoration:underline;" onclick="renderRekapPage()">Lihat rekap →</span></div>`;
    } else {
      rekapEl.innerHTML = `<div class="alert alert-info">📋 Belum ada absensi hari ini. Pilih kelas untuk mulai.</div>`;
    }
  } catch (e) {
    el.innerHTML = `<div class="empty"><div class="empty-icon">⚠️</div><div class="empty-text">Gagal memuat data</div><div class="empty-sub">${e.message}</div></div>`;
  }
}

// ─── INIT ─────────────────────────────────────────────────────────────────────
document.getElementById('absen-tanggal').max = today();
renderDashboard();
