/* Service worker - Quản Lý Kẹp Chì Đầu Máy
   Chỉ làm 2 việc: giữ bản sao giao diện (để mở được khi mất mạng) và giữ bản sao
   các thư viện Tailwind/Firebase. KHÔNG đụng tới dữ liệu: mọi kết nối Firebase
   Realtime Database, IndexedDB, localStorage đều đi thẳng như cũ. */
const VERSION = 'v16.3';
const SHELL_CACHE = 'kepchi-shell-' + VERSION;
const LIB_CACHE = 'kepchi-libs-v1';   // thư viện bên ngoài, giữ qua các phiên bản
const SHELL = [
    './',
    './index.html',
    './manifest.webmanifest',
    './icons/icon-192.png',
    './icons/icon-512.png',
    './icons/apple-touch-icon.png',
    './icons/favicon-48.png'
];
const LIB_HOSTS = ['cdn.tailwindcss.com', 'www.gstatic.com'];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(SHELL_CACHE)
            .then(c => c.addAll(SHELL))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(keys
                .filter(k => k.startsWith('kepchi-shell-') && k !== SHELL_CACHE)
                .map(k => caches.delete(k))))
            .then(() => self.clients.claim())
    );
});

function cacheable(res) {
    // 200 thường, hoặc opaque (status 0) khi nạp script chéo nguồn không CORS
    return res && (res.ok || res.type === 'opaque');
}

self.addEventListener('fetch', event => {
    const req = event.request;
    if (req.method !== 'GET') return;
    const url = new URL(req.url);

    // 1) Trang chính: ưu tiên bản mới từ mạng, mất mạng thì dùng bản đã lưu
    if (req.mode === 'navigate' && url.origin === self.location.origin) {
        event.respondWith(
            fetch(req)
                .then(res => {
                    if (res && res.ok) {
                        const copy = res.clone();
                        caches.open(SHELL_CACHE).then(c => c.put('./index.html', copy));
                    }
                    return res;
                })
                .catch(() => caches.match('./index.html').then(r => r || caches.match('./')))
        );
        return;
    }

    // 2) Thư viện bên ngoài (Tailwind, Firebase SDK): có bản lưu thì dùng ngay,
    //    đồng thời cập nhật ngầm
    if (LIB_HOSTS.includes(url.hostname)) {
        event.respondWith(
            caches.open(LIB_CACHE).then(cache =>
                cache.match(req).then(hit => {
                    const refresh = fetch(req).then(res => {
                        if (cacheable(res)) cache.put(req, res.clone());
                        return res;
                    }).catch(() => hit);
                    return hit || refresh;
                })
            )
        );
        return;
    }

    // 3) Tệp tĩnh cùng nguồn (biểu tượng, manifest): bản lưu trước, không có thì mạng
    if (url.origin === self.location.origin) {
        event.respondWith(
            caches.match(req).then(hit => hit || fetch(req).then(res => {
                if (res && res.ok) {
                    const copy = res.clone();
                    caches.open(SHELL_CACHE).then(c => c.put(req, copy));
                }
                return res;
            }))
        );
    }
    // Mọi yêu cầu khác (Firebase Database, v.v.): không can thiệp
});
