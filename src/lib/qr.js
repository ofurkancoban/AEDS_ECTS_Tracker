// QR encoder (byte mode, versions 1-10, EC level L), written from scratch for the
// classic UI against ISO/IEC 18004 and kept verbatim here.
/* eslint-disable */
var Nr = new Array(512), Gs = new Array(256);
  (function () {
    let n = 1;
    for (let t = 0; t < 255; t++)
      ((Nr[t] = n), (Gs[n] = t), (n <<= 1), n & 256 && (n ^= 285));
    for (let t = 255; t < 512; t++) Nr[t] = Nr[t - 255];
  })();
  function Ys(e, n) {
    return e === 0 || n === 0 ? 0 : Nr[Gs[e] + Gs[n]];
  }
  function Xg(e) {
    let n = [1];
    for (let t = 0; t < e; t++) {
      let r = new Array(n.length + 1).fill(0);
      for (let o = 0; o < n.length; o++)
        ((r[o] ^= Ys(n[o], 1)), (r[o + 1] ^= Ys(n[o], Nr[t])));
      n = r;
    }
    return n;
  }
  function Vg(e, n) {
    let t = Xg(n),
      r = e.slice(),
      o = new Array(n).fill(0),
      i = r.concat(o);
    for (let l = 0; l < e.length; l++) {
      let a = i[l];
      if (a !== 0) for (let u = 0; u < t.length; u++) i[l + u] ^= Ys(t[u], a);
    }
    return i.slice(e.length);
  }
  var qs = {
      1: { ecCwPerBlock: 7, blocks: [[1, 19]] },
      2: { ecCwPerBlock: 10, blocks: [[1, 34]] },
      3: { ecCwPerBlock: 15, blocks: [[1, 55]] },
      4: { ecCwPerBlock: 20, blocks: [[1, 80]] },
      5: { ecCwPerBlock: 26, blocks: [[1, 108]] },
      6: { ecCwPerBlock: 18, blocks: [[2, 68]] },
      7: { ecCwPerBlock: 20, blocks: [[2, 78]] },
      8: { ecCwPerBlock: 24, blocks: [[2, 97]] },
      9: { ecCwPerBlock: 30, blocks: [[2, 116]] },
      10: {
        ecCwPerBlock: 18,
        blocks: [
          [2, 68],
          [2, 69],
        ],
      },
    },
    Wg = {
      1: [],
      2: [6, 18],
      3: [6, 22],
      4: [6, 26],
      5: [6, 30],
      6: [6, 34],
      7: [6, 22, 38],
      8: [6, 24, 42],
      9: [6, 26, 46],
      10: [6, 28, 50],
    };
  function Ef(e) {
    return 17 + e * 4;
  }
  function xf(e) {
    return e <= 9 ? 8 : 16;
  }
  function qg(e) {
    let r = qs[e].blocks.reduce((i, [l, a]) => i + l * a, 0) * 8,
      o = 4 + xf(e);
    return Math.max(0, Math.floor((r - o) / 8));
  }
  function Zg(e) {
    for (let n = 1; n <= 10; n++) if (qg(n) >= e) return n;
    return null;
  }
  function _g() {
    return {
      bits: [],
      put(e, n) {
        for (let t = n - 1; t >= 0; t--) this.bits.push((e >>> t) & 1);
      },
    };
  }
  function $g(e, n) {
    let t = _g();
    (t.put(4, 4), t.put(e.length, xf(n)));
    for (let m of e) t.put(m, 8);
    let i = qs[n].blocks.reduce((m, [h, v]) => m + h * v, 0) * 8,
      l = Math.min(4, i - t.bits.length);
    for (t.put(0, l); t.bits.length % 8 !== 0;) t.bits.push(0);
    let a = [236, 17],
      u = 0;
    for (; t.bits.length < i;) (t.put(a[u % 2], 8), u++);
    let c = [];
    for (let m = 0; m < t.bits.length; m += 8) {
      let h = 0;
      for (let v = 0; v < 8; v++) h = (h << 1) | t.bits[m + v];
      c.push(h);
    }
    return c;
  }
  function eh(e, n) {
    let t = qs[e],
      r = [],
      o = 0;
    for (let [c, m] of t.blocks)
      for (let h = 0; h < c; h++) {
        let v = n.slice(o, o + m);
        o += m;
        let y = Vg(v, t.ecCwPerBlock);
        r.push({ data: v, ec: y });
      }
    let i = Math.max(...r.map((c) => c.data.length)),
      l = [];
    for (let c = 0; c < i; c++)
      for (let m of r) c < m.data.length && l.push(m.data[c]);
    let a = t.ecCwPerBlock,
      u = [];
    for (let c = 0; c < a; c++) for (let m of r) u.push(m.ec[c]);
    return l.concat(u);
  }
  function nh(e) {
    let n = Ef(e);
    return Array.from({ length: n }, () => new Array(n).fill(null));
  }
  function bs(e, n, t) {
    for (let r = -1; r <= 7; r++)
      for (let o = -1; o <= 7; o++) {
        let i = n + r,
          l = t + o;
        if (i < 0 || l < 0 || i >= e.length || l >= e.length) continue;
        let a = r === 0 || r === 6 || o === 0 || o === 6,
          u = r >= 2 && r <= 4 && o >= 2 && o <= 4;
        r >= 0 && r <= 6 && o >= 0 && o <= 6 && (a || u)
          ? (e[i][l] = !0)
          : (e[i][l] = !1);
      }
  }
  function th(e, n) {
    let t = e.length;
    (bs(e, 0, 0), bs(e, 0, t - 7), bs(e, t - 7, 0));
    for (let o = 8; o < t - 8; o++)
      (e[6][o] === null && (e[6][o] = o % 2 === 0),
        e[o][6] === null && (e[o][6] = o % 2 === 0));
    let r = Wg[n] || [];
    for (let o of r)
      for (let i of r)
        if (!(
          (o <= 8 && i <= 8) ||
          (o <= 8 && i >= t - 9) ||
          (o >= t - 9 && i <= 8)
        ))
          for (let l = -2; l <= 2; l++)
            for (let a = -2; a <= 2; a++) {
              let u = Math.max(Math.abs(l), Math.abs(a)) === 2,
                c = l === 0 && a === 0;
              e[o + l][i + a] = u || c;
            }
    e[t - 8][8] = !0;
    for (let o = 0; o < 9; o++)
      o !== 6 &&
        (e[8][o] === null && (e[8][o] = "reserved"),
        e[o][8] === null && (e[o][8] = "reserved"));
    for (let o = 0; o < 8; o++)
      (e[8][t - 1 - o] === null && (e[8][t - 1 - o] = "reserved"),
        e[t - 1 - o][8] === null && (e[t - 1 - o][8] = "reserved"));
    if (((e[8][8] = "reserved"), n >= 7))
      for (let o = 0; o < 18; o++) {
        let i = Math.floor(o / 3),
          l = (o % 3) + t - 11;
        (e[i][l] === null && (e[i][l] = "reserved"),
          e[l][i] === null && (e[l][i] = "reserved"));
      }
  }
  function rh(e, n) {
    let t = e.length,
      r = [];
    for (let a of n) for (let u = 7; u >= 0; u--) r.push((a >>> u) & 1);
    let o = 0,
      i = t - 1,
      l = -1;
    for (; i > 0;) {
      i === 6 && i--;
      for (let a = 0; a < t; a++) {
        let u = l === -1 ? t - 1 - a : a;
        for (let c of [i, i - 1])
          if (e[u][c] === null) {
            let m = o < r.length ? r[o] : 0;
            (o++, (e[u][c] = { bit: !!m }));
          }
      }
      ((i -= 2), (l = -l));
    }
  }
  function oh(e, n) {
    let t = e.length,
      r = Array.from({ length: t }, () => new Array(t).fill(!1));
    for (let o = 0; o < t; o++)
      for (let i = 0; i < t; i++) {
        let l = e[o][i];
        l && typeof l == "object" && "bit" in l
          ? (r[o][i] = n(o, i) ? !l.bit : l.bit)
          : l === "reserved"
            ? (r[o][i] = !1)
            : (r[o][i] = !!l);
      }
    return r;
  }
  var ih = [
    (e, n) => (e + n) % 2 === 0,
    (e) => e % 2 === 0,
    (e, n) => n % 3 === 0,
    (e, n) => (e + n) % 3 === 0,
    (e, n) => (Math.floor(e / 2) + Math.floor(n / 3)) % 2 === 0,
    (e, n) => ((e * n) % 2) + ((e * n) % 3) === 0,
    (e, n) => (((e * n) % 2) + ((e * n) % 3)) % 2 === 0,
    (e, n) => (((e + n) % 2) + ((e * n) % 3)) % 2 === 0,
  ];
  function lh(e) {
    let n = e.length,
      t = 0;
    for (let u = 0; u < n; u++) {
      let c = e[u][0],
        m = 1;
      for (let h = 1; h < n; h++)
        e[u][h] === c
          ? m++
          : (m >= 5 && (t += 3 + (m - 5)), (c = e[u][h]), (m = 1));
      m >= 5 && (t += 3 + (m - 5));
    }
    for (let u = 0; u < n; u++) {
      let c = e[0][u],
        m = 1;
      for (let h = 1; h < n; h++)
        e[h][u] === c
          ? m++
          : (m >= 5 && (t += 3 + (m - 5)), (c = e[h][u]), (m = 1));
      m >= 5 && (t += 3 + (m - 5));
    }
    for (let u = 0; u < n - 1; u++)
      for (let c = 0; c < n - 1; c++) {
        let m = e[u][c];
        m === e[u][c + 1] &&
          m === e[u + 1][c] &&
          m === e[u + 1][c + 1] &&
          (t += 3);
      }
    let r = [!0, !1, !0, !0, !0, !1, !0, !1, !1, !1, !1],
      o = r.slice().reverse();
    function i(u, c, m) {
      for (let h = 0; h < m.length; h++) if (u[c + h] !== m[h]) return !1;
      return !0;
    }
    for (let u = 0; u < n; u++)
      for (let c = 0; c <= n - 11; c++) {
        let m = e[u].slice(c, c + 11);
        (i(m, 0, r) || i(m, 0, o)) && (t += 40);
      }
    for (let u = 0; u < n; u++)
      for (let c = 0; c <= n - 11; c++) {
        let m = [];
        for (let h = 0; h < 11; h++) m.push(e[c + h][u]);
        (i(m, 0, r) || i(m, 0, o)) && (t += 40);
      }
    let l = 0;
    for (let u = 0; u < n; u++) for (let c = 0; c < n; c++) e[u][c] && l++;
    let a = (l / (n * n)) * 100;
    return ((t += Math.floor(Math.abs(a - 50) / 5) * 10), t);
  }
  function sh(e) {
    let t = e << 10;
    for (let r = 4; r >= 0; r--) t & (1 << (r + 10)) && (t ^= 1335 << r);
    return (e << 10) | t;
  }
  function ah(e, n) {
    let t = (e << 3) | n;
    return sh(t) ^ 21522;
  }
  function uh(e, n) {
    let t = e.length;
    for (let r = 0; r < 15; r++) {
      let o = ((n >> r) & 1) === 1;
      (r < 6
        ? (e[r][8] = o)
        : r < 8
          ? (e[r + 1][8] = o)
          : (e[t - 15 + r][8] = o),
        r < 8
          ? (e[8][t - r - 1] = o)
          : r < 9
            ? (e[8][15 - r - 1 + 1] = o)
            : (e[8][15 - r - 1] = o));
    }
    e[t - 8][8] = !0;
  }
  function Us(e) {
    let n = 0;
    for (; e !== 0;) (n++, (e >>>= 1));
    return n;
  }
  var If = 7973,
    ff = Us(If);
  function ch(e) {
    let n = e << 12;
    for (; Us(n) - ff >= 0;) n ^= If << (Us(n) - ff);
    return (e << 12) | n;
  }
  function dh(e, n) {
    if (n < 7) return;
    let t = e.length,
      r = ch(n);
    for (let o = 0; o < 18; o++) {
      let i = Math.floor(o / 3),
        l = (o % 3) + t - 11,
        a = ((r >> o) & 1) === 1;
      ((e[i][l] = a), (e[l][i] = a));
    }
  }
  function fh(e) {
    let n = Array.from(new TextEncoder().encode(e)),
      t = Zg(n.length);
    if (!t) return null;
    let r = $g(n, t),
      o = eh(t, r),
      i = nh(t);
    (th(i, t), rh(i, o));
    let l = null;
    for (let a = 0; a < 8; a++) {
      let u = oh(i, ih[a]),
        c = ah(1, a),
        m = u.map((v) => v.slice());
      (uh(m, c), dh(m, t));
      let h = lh(m);
      (!l || h < l.score) && (l = { score: h, matrix: m, maskIdx: a });
    }
    return { matrix: l.matrix, version: t, size: Ef(t) };
  }
export function encodeQR(text) { return fh(text); }
