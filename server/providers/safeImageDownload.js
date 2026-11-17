import https from 'node:https';
import dns from 'node:dns/promises';
import net from 'node:net';
import sharp from 'sharp';

export function isPublicAddress(address) {
    if (net.isIP(address) === 4) {
        const [a, b, c] = address.split('.').map(Number);
        return !(a === 0 || a === 10 || a === 127 || a >= 224 ||
            (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
            (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 168 || b === 0 || (b === 88 && c === 99))) ||
            (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) || (a === 203 && b === 0 && c === 113));
    }
    // Only native global unicast; reject mapped, link-local and transition ranges.
    return net.isIP(address) === 6 && /^[23]/i.test(address) && !/^200[12]:/i.test(address);
}

// Optional compatibility for local proxy Fake-IP DNS. Resolution still goes
// through public-address validation and the HTTPS connection pins that result.
export async function lookupImageHost(hostname, options) {
    if (process.env.IMAGE_DNS_OVER_HTTPS !== 'true') return dns.lookup(hostname, options);
    const response = await fetch(`https://dns.alidns.com/resolve?name=${encodeURIComponent(hostname)}&type=A`, {
        signal: AbortSignal.timeout(5000), redirect: 'error'
    });
    if (!response.ok) throw new Error('图片域名解析服务不可用');
    const result = await response.json();
    if (result.Status !== 0) throw new Error('图片域名解析失败');
    return (result.Answer || []).filter(item => item.type === 1 && net.isIP(item.data) === 4)
        .map(item => ({ address: item.data, family: 4 }));
}

export async function validateImageUrl(value, lookup = lookupImageHost) {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) throw new Error('图片地址必须是公网 HTTPS 地址');
    const hostname = url.hostname.replace(/^\[|\]$/g, '');
    const addresses = net.isIP(hostname) ? [{ address: hostname, family: net.isIP(hostname) }] : await lookup(hostname, { all: true, verbatim: true });
    if (!addresses.length || addresses.some(a => !isPublicAddress(a.address))) throw new Error('禁止访问内网或保留地址');
    return { url, addresses };
}

export async function imageUrlToDataUrl(value) {
    if (/^data:image\/(png|jpeg|webp|gif);base64,/i.test(value)) return value;
    const deadline = Date.now() + 30000;
    let current = value;
    for (let hop = 0; hop <= 3; hop++) {
        const { url, addresses } = await validateImageUrl(current);
        const remaining = deadline - Date.now();
        if (remaining <= 0) throw new Error('图片下载超时');
        const result = await new Promise((resolve, reject) => {
            const req = https.get(url, {
                rejectUnauthorized: true,
                // Pin the DNS result to prevent rebinding between validation and fetch.
                lookup: (_host, options, callback) => options.all ? callback(null, addresses) : callback(null, addresses[0].address, addresses[0].family),
                headers: { Accept: 'image/png,image/jpeg,image/webp,image/gif' }
            }, res => {
                if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
                    res.resume(); resolve({ redirect: new URL(res.headers.location, url).href }); return;
                }
                if (res.statusCode !== 200 || !/^(?:image\/(?:png|jpeg|webp|gif)|application\/octet-stream)(;|$)/i.test(res.headers['content-type'] || '')) {
                    res.resume(); reject(new Error('下载结果不是支持的图片')); return;
                }
                const chunks = []; let size = 0;
                res.on('data', chunk => {
                    size += chunk.length;
                    if (size > 20 * 1024 * 1024) req.destroy(new Error('图片超过 20MB 限制'));
                    else chunks.push(chunk);
                });
                res.on('end', () => resolve({ bytes: Buffer.concat(chunks) }));
                res.on('error', reject);
            });
            const timer = setTimeout(() => req.destroy(new Error('图片下载超时')), remaining);
            req.on('close', () => clearTimeout(timer)); req.on('error', reject);
        });
        if (result.redirect) { current = result.redirect; continue; }
        const meta = await sharp(result.bytes, { limitInputPixels: 40000000 }).metadata();
        if (!['png', 'jpeg', 'webp', 'gif'].includes(meta.format)) throw new Error('无效的图片内容');
        return `data:image/${meta.format};base64,${result.bytes.toString('base64')}`;
    }
    throw new Error('图片重定向次数过多');
}
