//#region src/ucs.ts
var e = [
	.4124564,
	.3575761,
	.1804375,
	.2126729,
	.7151522,
	.072175,
	.0193339,
	.119192,
	.9503041
], t = [
	3.2404542,
	-1.5371385,
	-.4985314,
	-.969266,
	1.8760108,
	.041556,
	.0556434,
	-.2040259,
	1.0572252
], n = [.31271, .32902], r = 2.098883786377, i = 2.09885, a = .631651345306265, o = 1.12426773749357, s = 1.5831518565279648, c = 15.932993652962535, l = .6523997524738018, u = .6007557017508491, d = .8322850678616855, f = [
	-.783941002840055,
	.745273540913283,
	.318707282433486
], p = [
	.277512987809202,
	-.205375866083878,
	2.16743692732158
], m = [
	.153836578598858,
	-.165478376301988,
	.291320554395942
], h = [1.39656225667, 1.4513954287], g = [1.49217352929, 1.52488637914], _ = [
	-1.124983854323892,
	-.980483721769325,
	1.86323315098672,
	1.971853092390862
], v = [
	-5.037522385190711,
	-2.504856328185843,
	4.760029407436461,
	2.874012963239247
], ee = [
	.167171472114775,
	-.150959086409163,
	.940254742367256
], te = [
	.141299802443708,
	-.155185060382272,
	1
], y = [
	-.00801531300850582,
	-.00843312433578007,
	-.0256325967652889
], b = 117549435e-46;
function ne(e) {
	let t = e ** +a;
	return r * t / (t + o);
}
function re(e) {
	return (o * e / (r - e)) ** +s;
}
var x = ne(1);
function S(e) {
	return e <= .04045 ? e / 12.92 : ((e + .055) / 1.055) ** 2.4;
}
function C(e) {
	return e <= .0031308 ? 12.92 * e : 1.055 * e ** (1 / 2.4) - .055;
}
function ie(e, t) {
	return [
		e[0] * t[0] + e[1] * t[1] + e[2] * t[2],
		e[3] * t[0] + e[4] * t[1] + e[5] * t[2],
		e[6] * t[0] + e[7] * t[1] + e[8] * t[2]
	];
}
function ae(t) {
	return ie(e, t);
}
function oe(e) {
	return ie(t, e);
}
function se(e) {
	let t = Math.max(e[0], 0), r = Math.max(e[1], 0), i = Math.max(e[2], 0), a = t + r + i;
	return a > 0 ? [
		t / a,
		r / a,
		r
	] : [
		n[0],
		n[1],
		r
	];
}
function ce(e) {
	let [t, n, r] = e;
	return n === 0 ? [
		0,
		0,
		0
	] : [
		r * t / n,
		r,
		r * (1 - t - n) / n
	];
}
function le(e) {
	return e >= 0 ? Math.max(b, e) : Math.min(-117549435e-46, e);
}
function ue(e) {
	let t = [
		0,
		0,
		0
	];
	for (let n = 0; n < 3; n++) t[n] = f[n] * e[0] + p[n] * e[1] + m[n];
	let n = le(t[2]), r = t[0] / n, i = t[1] / n, a = h[0] * r / (Math.abs(r) + g[0]), o = h[1] * i / (Math.abs(i) + g[1]);
	return [_[0] * a + _[1] * o, _[2] * a + _[3] * o];
}
function de(e) {
	let [t, n] = ue(e), r = ne(e[2]), i = t * t + n * n;
	return [
		r / x,
		c * r ** +l * i ** +u / x,
		Math.atan2(n, t)
	];
}
function fe(e) {
	let t = Math.min(Math.max(e[0] * x, 0), i), n = t === 0 ? 0 : (e[1] * x / (c * t ** +l)) ** d, r = n * Math.cos(e[2]), a = n * Math.sin(e[2]), o = v[0] * r + v[1] * a, s = v[2] * r + v[3] * a, u = -g[0] * o / (Math.abs(o) - h[0]), f = -g[1] * s / (Math.abs(s) - h[1]), p = [
		0,
		0,
		0
	];
	for (let e = 0; e < 3; e++) p[e] = ee[e] * u + te[e] * f + y[e];
	let m = le(p[2]);
	return [
		p[0] / m,
		p[1] / m,
		re(t)
	];
}
function pe(e) {
	return de(se(ae(e)));
}
function me(e) {
	return oe(ce(fe(e)));
}
function he(e) {
	return (e + Math.PI) / (2 * Math.PI);
}
function ge(e) {
	return e * 2 * Math.PI - Math.PI;
}
function _e(e) {
	let t = Math.max(e[0], e[1], e[2]), n = t - Math.min(e[0], e[1], e[2]), r;
	return r = e[0] === t ? (e[1] - e[2]) / n : e[1] === t ? 2 + (e[2] - e[0]) / n : 4 + (e[0] - e[1]) / n, r /= 6, r - Math.floor(r);
}
function ve(e) {
	let t = Math.max(e[0], e[1], e[2]), n = t - Math.min(e[0], e[1], e[2]);
	return Math.abs(t) > 1e-6 && Math.abs(n) > 1e-6 ? [
		_e(e),
		n,
		t
	] : [
		0,
		0,
		t
	];
}
function ye(e, t, n) {
	let r = t * n, i = n - r, a = e * 6, o = Math.floor(a), s = (a - o) * r, c = r + i, l = r - s + i, u = s + i;
	switch ((o % 6 + 6) % 6) {
		case 0: return [
			c,
			u,
			i
		];
		case 1: return [
			l,
			c,
			i
		];
		case 2: return [
			i,
			c,
			u
		];
		case 3: return [
			i,
			l,
			c
		];
		case 4: return [
			u,
			i,
			c
		];
		default: return [
			c,
			i,
			l
		];
	}
}
var be = .65, xe = .85, w = (...e) => e.map((e) => e / 12), T = [
	{
		id: 0,
		label: "Monochromatic",
		sectors: w(0),
		lengths: [.8]
	},
	{
		id: 1,
		label: "Analogous",
		sectors: w(-1, 0, 1),
		lengths: [
			.5,
			.8,
			.5
		]
	},
	{
		id: 2,
		label: "Analogous complementary",
		sectors: w(-1, 0, 1, 6),
		lengths: [
			.5,
			.8,
			.5,
			.5
		]
	},
	{
		id: 3,
		label: "Complementary",
		sectors: w(0, 6),
		lengths: [.8, .5]
	},
	{
		id: 4,
		label: "Split complementary",
		sectors: w(0, 5, 7),
		lengths: [
			.8,
			.5,
			.5
		]
	},
	{
		id: 5,
		label: "Dyad",
		sectors: w(-1, 1),
		lengths: [.8, .8]
	},
	{
		id: 6,
		label: "Triad",
		sectors: w(0, 4, 8),
		lengths: [
			.8,
			.5,
			.5
		]
	},
	{
		id: 7,
		label: "Tetrad",
		sectors: w(-1, 1, 5, 7),
		lengths: [
			.8,
			.8,
			.5,
			.5
		]
	},
	{
		id: 8,
		label: "Square",
		sectors: w(0, 3, 6, 9),
		lengths: [
			.8,
			.5,
			.5,
			.5
		]
	},
	{
		id: 9,
		label: "Custom",
		sectors: [],
		lengths: []
	}
], E = Object.freeze({
	rule: 3,
	anchorHue: .1,
	customHues: Object.freeze([
		0,
		.25,
		.5,
		.75
	]),
	customNodes: 4,
	nodeSat: Object.freeze([
		1,
		1,
		1,
		1
	]),
	pullStrength: 0,
	pullWidth: 1,
	neutralProtection: .5,
	smoothing: 0
}), D = (e, t, n) => e < t ? t : e > n ? n : e;
function Se(e) {
	return e %= 1, e < 0 ? e + 1 : e;
}
function Ce(e, t) {
	let n = T[e];
	if (!n || n.sectors.length === 0) return [];
	let r = t / 360;
	return n.sectors.map((e) => {
		let t = e + r;
		return t - Math.floor(t);
	});
}
var O = [
	0,
	1 / 6,
	2 / 6,
	3 / 6,
	4 / 6,
	5 / 6,
	1
], we = [
	0,
	1 / 3,
	.472217,
	.611105,
	.715271,
	5 / 6,
	1
];
function Te(e) {
	let t = e - Math.floor(e), n = 0;
	for (; n < 5 && t >= O[n + 1];) n++;
	let r = (t - O[n]) / (O[n + 1] - O[n]);
	return we[n] + r * (we[n + 1] - we[n]);
}
function Ee(e) {
	let t = me(e);
	return [
		C(t[0]),
		C(t[1]),
		C(t[2])
	];
}
function De(e) {
	let t = ge(e), n = 0, r = 2;
	for (let e = 0; e < 16; e++) {
		let e = (n + r) * .5, i = Ee([
			be,
			e,
			t
		]);
		i[0] >= 0 && i[1] >= 0 && i[2] >= 0 && i[0] <= 1 && i[1] <= 1 && i[2] <= 1 ? n = e : r = e;
	}
	return n;
}
function Oe(e, t) {
	let n = Ee([
		be,
		t,
		ge(e)
	]);
	return [
		D(n[0], 0, 1),
		D(n[1], 0, 1),
		D(n[2], 0, 1)
	];
}
function ke(e) {
	return Oe(e, De(e) * xe);
}
function Ae(e) {
	let t = ke(e), [n] = ve([
		S(t[0]),
		S(t[1]),
		S(t[2])
	]);
	return Te(n);
}
function je(e, t, n) {
	t - e > .5 ? --t : e - t > .5 && --e;
	let r = e + n * (t - e);
	return r < 0 ? r + 1 : r;
}
function Me() {
	let e = /* @__PURE__ */ new Float64Array(720);
	for (let t = 0; t < 720; t++) e[t] = Ae(t / 720);
	let t = /* @__PURE__ */ new Float64Array(720);
	for (let n = 0; n < 720; n++) {
		let r = n / 720, i = 1, a = 0;
		for (let t = 0; t < 720; t++) {
			let n = Math.abs(e[t] - r);
			n > .5 && (n = 1 - n), n < i && (i = n, a = t / 720);
		}
		t[n] = a;
	}
	return {
		forward: e,
		inverse: t
	};
}
var Ne = Me();
function Pe(e, t) {
	let n = Se(t) * 720, r = Math.trunc(n) % 720, i = (r + 1) % 720;
	return je(e[r], e[i], n - Math.trunc(n));
}
function k(e) {
	return Pe(Ne.forward, e);
}
function A(e) {
	return Pe(Ne.inverse, e);
}
function j(e) {
	return Math.round(k(e.anchorHue) * 360) % 360;
}
function M(e) {
	if (e.rule === 9) {
		let t = D(Math.round(e.customNodes), 1, 4), n = [];
		for (let r = 0; r < t; r++) n.push(e.customHues[r] ?? 0);
		return {
			nodes: n,
			count: t
		};
	}
	let t = Ce(e.rule, j(e)).map(A);
	return {
		nodes: t,
		count: t.length
	};
}
function Fe(e, t) {
	if (t !== 9 || e.rule === 9) return {
		...e,
		rule: t
	};
	let { nodes: n, count: r } = M(e), i = [...e.customHues];
	for (let e = 0; e < r && e < 4; e++) i[e] = n[e];
	return r < 2 && (i[1] = i[0]), {
		...e,
		rule: t,
		customHues: i,
		customNodes: D(r, 2, 4)
	};
}
function Ie(e) {
	return e.pullStrength > 0 || e.nodeSat.some((e) => e !== 1);
}
function Le(e, t, n) {
	let { nodes: r, count: i } = M({
		...E,
		rule: t,
		anchorHue: n
	});
	if (i <= 0) return 0;
	let a = .5 / i, o = 1 / (2 * a * a), s = 0, c = 0;
	for (let t = 0; t < e.length; t++) {
		let n = e[t];
		if (n <= 0) continue;
		let a = (t + .5) / e.length, l = 0;
		for (let e = 0; e < i; e++) {
			let t = Math.abs(a - r[e]);
			t > .5 && (t = 1 - t);
			let n = Math.exp(-t * t * o);
			n > l && (l = n);
		}
		c += n * l, s += n;
	}
	return s > 1e-6 ? c / s : 0;
}
function Re(e) {
	let t = e.length, n = Float32Array.from(e);
	for (let e = 0; e < 3; e++) {
		let e = new Float32Array(t);
		for (let r = 0; r < t; r++) e[r] = (n[(r - 1 + t) % t] + n[r] + n[(r + 1) % t]) * (1 / 3);
		n = e;
	}
	let r = {
		rule: 3,
		anchor: 0
	}, i = -1;
	for (let e = 0; e < 9; e++) for (let t = 0; t < 360; t++) {
		let a = t / 360, o = Le(n, e, a);
		o > i && (i = o, r = {
			rule: e,
			anchor: a
		});
	}
	return r;
}
//#endregion
//#region src/params.ts
var N = "colour-harmony";
function ze(e) {
	let t = 0;
	for (let n = 0; n < e.length; n++) t = (t << 5) - t + e.charCodeAt(n) | 0;
	return (t >>> 0).toString(36).slice(0, 4);
}
function Be(e) {
	let t = /* @__PURE__ */ new Set();
	return e.map((e) => {
		let n = e;
		for (let r = 1; t.has(ze(n)) && r < 1e3; r++) n = `${e}-${r}`;
		return t.add(ze(n)), n;
	});
}
var [Ve, He] = Be([`${N}.harmonize`, `${N}.smooth`]), Ue = Ve, We = He, Ge = (e, t) => {
	let n = {};
	for (let r of t) n[r] = `${e}.${r}`;
	return n;
}, P = [
	"rule",
	"anchorHue",
	"customHues",
	"customNodes",
	"nodeSat",
	"pullStrength",
	"pullWidth",
	"neutralProtection",
	"smoothing",
	"nodes",
	"nodeCount"
], F = Ge(Ue, P), I = Ge(We, [
	"nodes",
	"nodeCount",
	"nodeSat",
	"pullWidth",
	"blur",
	"pullStrength",
	"neutralProtection",
	"on"
]), Ke = [...Object.values(F), ...Object.values(I)], qe = (e, t, n) => e < t ? t : e > n ? n : e;
function L(e, t, n) {
	let r = e[t];
	return typeof r == "number" && Number.isFinite(r) ? r : n;
}
function Je(e, t, n) {
	let r = e[t];
	return Array.isArray(r) && r.length === 4 && r.every((e) => typeof e == "number" && Number.isFinite(e)) ? [...r] : [...n];
}
function R(e) {
	let t = E;
	return {
		rule: qe(Math.round(L(e, F.rule, t.rule)), 0, 9),
		anchorHue: L(e, F.anchorHue, t.anchorHue),
		customHues: Je(e, F.customHues, t.customHues),
		customNodes: qe(Math.round(L(e, F.customNodes, t.customNodes)), 2, 4),
		nodeSat: Je(e, F.nodeSat, t.nodeSat),
		pullStrength: L(e, F.pullStrength, t.pullStrength),
		pullWidth: L(e, F.pullWidth, t.pullWidth),
		neutralProtection: L(e, F.neutralProtection, t.neutralProtection),
		smoothing: L(e, F.smoothing, t.smoothing)
	};
}
function Ye(e) {
	return e.smoothing > 0 && Ie(e);
}
var Xe = [
	0,
	0,
	0,
	0
];
function Ze(e) {
	let t = [...Xe];
	for (let n = 0; n < e.length && n < 4; n++) t[n] = e[n];
	return t;
}
function z(e) {
	let { nodes: t, count: n } = M(e), r = Ze(t), i = {
		[F.rule]: e.rule,
		[F.anchorHue]: e.anchorHue,
		[F.customHues]: [...e.customHues],
		[F.customNodes]: e.customNodes,
		[F.nodeSat]: [...e.nodeSat],
		[F.pullStrength]: e.pullStrength,
		[F.pullWidth]: e.pullWidth,
		[F.neutralProtection]: e.neutralProtection,
		[F.smoothing]: e.smoothing,
		[F.nodes]: r,
		[F.nodeCount]: n
	}, a = Ye(e);
	return i[I.nodes] = a ? [...r] : [...Xe], i[I.nodeCount] = a ? n : 0, i[I.nodeSat] = a ? [...e.nodeSat] : [...Xe], i[I.pullWidth] = a ? e.pullWidth : 0, i[I.blur] = a ? e.smoothing * Math.max(1, e.pullWidth) : 0, i[I.pullStrength] = a ? e.pullStrength : 0, i[I.neutralProtection] = a ? e.neutralProtection : 0, i[I.on] = +!!a, i;
}
function Qe() {
	return z(E);
}
var $e = (e, t) => Array.isArray(e) && Array.isArray(t) ? e.length === t.length && e.every((e, n) => e === t[n]) : e === t;
function et(e) {
	if (!P.filter((e) => e !== "nodes" && e !== "nodeCount").map((e) => F[e]).some((t) => t in e)) return null;
	let t = z(R(e));
	return [
		F.nodes,
		F.nodeCount,
		...Object.values(I)
	].every((n) => $e(e[n], t[n])) ? null : t;
}
//#endregion
//#region src/colour.ts
var tt = .01;
function nt(e) {
	let [t, n, r] = ke(A(e / 360));
	return [
		t,
		n,
		r
	];
}
function rt(e, t) {
	let [, n, r] = pe([
		S(e[0]),
		S(e[1]),
		S(e[2])
	]);
	return n > tt ? k(he(r)) * 360 : t;
}
var it = z({
	...E,
	pullStrength: 0,
	nodeSat: [
		1,
		1,
		1,
		1
	]
}), at = null;
function ot(e) {
	at = e;
}
function B() {
	if (!at) throw Error("[colour-harmony] api() called before activate()");
	return at;
}
function V(e, t, ...n) {
	return B().react.createElement(e, t, ...n);
}
//#endregion
//#region src/ryb.ts
var st = [
	0,
	1 / 6,
	2 / 6,
	3 / 6,
	4 / 6,
	5 / 6,
	1
], ct = [
	0,
	1 / 3,
	.472217,
	.611105,
	.715271,
	5 / 6,
	1
], lt = [
	0,
	.083333,
	.166667,
	.383838,
	.586575,
	.833333,
	1
];
function ut(e, t) {
	let n = e.length;
	if (n < 2) return () => t[0] ?? 0;
	let r = new Float64Array(n - 1);
	for (let t = 0; t < n - 1; t++) r[t] = e[t + 1] - e[t];
	let i = new Float64Array(n);
	if (n > 2) {
		let e = new Float64Array(n - 2), a = new Float64Array(n - 2), o = new Float64Array(n - 2);
		for (let i = 1; i < n - 1; i++) e[i - 1] = 2 * (r[i - 1] + r[i]), a[i - 1] = r[i], o[i - 1] = 6 * ((t[i + 1] - t[i]) / r[i] - (t[i] - t[i - 1]) / r[i - 1]);
		for (let t = 1; t < n - 2; t++) {
			let n = r[t] / e[t - 1];
			e[t] -= n * a[t - 1], o[t] -= n * o[t - 1];
		}
		i[n - 2] = o[n - 3] / e[n - 3];
		for (let t = n - 4; t >= 0; t--) i[t + 1] = (o[t] - a[t] * i[t + 2]) / e[t];
	}
	return (a) => {
		let o = a < e[0] ? e[0] : a > e[n - 1] ? e[n - 1] : a, s = n - 2;
		for (let t = 0; t < n - 1; t++) if (o < e[t + 1]) {
			s = t;
			break;
		}
		let c = o - e[s], l = r[s], u = l - c;
		return (i[s] * u * u * u + i[s + 1] * c * c * c) / (6 * l) + (t[s] - i[s] * l * l / 6) * (u / l) + (t[s + 1] - i[s + 1] * l * l / 6) * (c / l);
	};
}
var dt = ut(st, ct), ft = ut(st, lt), pt = (e) => e - Math.floor(e);
function mt(e) {
	return dt(pt(e));
}
function ht(e) {
	return ft(pt(e));
}
var gt = {
	normal: .5 / 12,
	large: .75 / 12,
	narrow: .25 / 12,
	line: 0
}, _t = .8, vt = 1 / 30, yt = .7, bt = .25;
function H(e) {
	return (e + bt) * 2 * Math.PI;
}
function xt(e) {
	let t = e / (2 * Math.PI) - bt;
	return t - Math.floor(t);
}
function St(e, t) {
	return Math.log1p(29 * e / t) / Math.log(30) * t;
}
function Ct(e) {
	let [t, n] = ve(e);
	return n <= 0 ? [0, 0] : [mt(t), n];
}
function wt(e, t, n) {
	if (t <= 0) return [0, 0];
	let r = H(e), i = n === "log" ? St(t, 1) : t;
	return [Math.cos(r) * i, Math.sin(r) * i];
}
function Tt(e, t, n, r) {
	let i = e.length, a = [];
	for (let o = 0; o < i; o++) {
		let s = o > 0 ? Math.min(n, (e[o] - e[o - 1]) / 2) : n, c = o < i - 1 ? Math.min(n, (e[o + 1] - e[o]) / 2) : n;
		a.push({
			a0: e[o] - s + r,
			a1: e[o] + c + r,
			radius: t[o]
		});
	}
	return a;
}
function Et(e, t) {
	return e.map((e) => ({
		a0: e - t,
		a1: e + t,
		radius: _t
	}));
}
function Dt(e, t, n) {
	let r = T[e];
	return r ? Tt(r.sectors, r.lengths, n, t / 360) : [];
}
function Ot(e, t, n) {
	return ((e === "coarse" ? Math.floor((t + 7) / 15) * 15 + 15 * n : t + n) % 360 + 360) % 360;
}
function kt(e, t, n) {
	return ((t + n) % e + e) % e;
}
function At(e) {
	let t = [];
	for (let n = 0; n < e; n++) t.push(ye(ht(n / e), 1, 1));
	return t;
}
function jt(e, t) {
	return vt * e * e / Math.max(1, t);
}
function Mt(e, t) {
	return e.sample === t.sample && e.scale === t.scale && e.sizePx === t.sizePx;
}
function Nt(e, t) {
	let n = t * e;
	return n <= 0 ? 0 : n >= 1 ? 1 : C(n);
}
//#endregion
//#region src/store.ts
var Pt = null;
function Ft() {
	Pt = B().stores.create((e) => ({
		sample: null,
		setSample: (t) => e({ sample: t })
	}));
}
function U() {
	if (!Pt) throw Error("[colour-harmony] store() called before activate()");
	return Pt;
}
var W = /* @__PURE__ */ new Float32Array(256);
for (let e = 0; e < 256; e++) W[e] = S(e / 255);
function It(e, t, n) {
	let r = t * n, i = new Float32Array(r * 2), a = /* @__PURE__ */ new Float32Array(360);
	for (let t = 0; t < r; t++) {
		let n = W[e[t * 4]], r = W[e[t * 4 + 1]], o = W[e[t * 4 + 2]], [s, c] = Ct([
			n,
			r,
			o
		]);
		i[t * 2] = s, i[t * 2 + 1] = c;
		let [, l, u] = pe([
			n,
			r,
			o
		]);
		l > .01 && (a[Math.floor(he(u) * 360) % 360] += l);
	}
	return {
		points: i,
		count: r,
		histogram: a,
		width: t,
		height: n
	};
}
var G = null;
function Lt(e) {
	let { width: t, height: n } = e;
	if (t < 2 || n < 2) return null;
	let r = Math.min(1, 192 / Math.max(t, n)), i = Math.max(1, Math.round(t * r)), a = Math.max(1, Math.round(n * r));
	G ||= new OffscreenCanvas(i, a), G.width !== i && (G.width = i), G.height !== a && (G.height = a);
	let o = G.getContext("2d", { willReadFrequently: !0 });
	return o ? (o.drawImage(e, 0, 0, i, a), {
		data: o.getImageData(0, 0, i, a).data,
		width: i,
		height: a
	}) : null;
}
function Rt(e) {
	let t = e.throttleMs ?? 150, n = !1, r = !1, i = !1, a = null, o = -Infinity, s = () => {
		a = null;
		let t = e.develop.getState();
		!n && t.photoId && (r = !0, o = Date.now(), e.capture(t.previewParams ?? t.params).then((t) => {
			let r = n ? null : e.readback(t);
			t.close?.(), !n && e.publish(r ? It(r.data, r.width, r.height) : null);
		}).catch(() => {
			n || e.publish(null);
		}).finally(() => {
			r = !1, i && !n && (i = !1, c());
		}));
	}, c = () => {
		if (n) return;
		if (r) {
			i = !0;
			return;
		}
		if (a !== null) return;
		let e = Math.max(0, t - (Date.now() - o));
		a = setTimeout(s, e);
	}, l = e.develop.subscribe((t, n) => {
		if (t.photoId !== n.photoId && !t.photoId) {
			i = !1, a !== null && (clearTimeout(a), a = null), e.publish(null);
			return;
		}
		t.photoId && (t.histogram !== n.histogram || t.photoId !== n.photoId) && c();
	});
	return c(), () => {
		n = !0, l(), a !== null && clearTimeout(a), a = null;
	};
}
function zt() {
	let e = B();
	return Rt({
		develop: e.stores.useDevelopStore,
		capture: (t) => e.develop.captureFrame(t),
		readback: Lt,
		publish: (e) => U().getState().setSample(e)
	});
}
//#endregion
//#region src/ScopeView.ts
var K = {
	scale: "scale",
	guideWidth: "guideWidth",
	dim: "dim"
}, q = [
	"normal",
	"large",
	"narrow",
	"line"
], Bt = 300, J = 48, Vt = 3, Ht = 8, Ut = 3, Wt = 360, Gt = .45, Kt = "Scroll to rotate the harmony by 15° · Ctrl+scroll for 1° · Shift+scroll changes the guide width · Alt+scroll cycles the rule";
function qt() {
	let e = B().settings, t = e.get(K.scale, "log"), n = e.get(K.guideWidth, "normal"), r = e.get(K.dim, yt);
	return {
		scale: t === "linear" ? "linear" : "log",
		guideWidth: q.includes(n) ? n : "normal",
		dim: typeof r == "number" && Number.isFinite(r) ? Math.min(1, Math.max(0, r)) : yt
	};
}
var Jt = (e, t = 1) => `rgba(${Math.round(e[0] * 255)}, ${Math.round(e[1] * 255)}, ${Math.round(e[2] * 255)}, ${t})`, Yt = At(J), Xt = At(Wt);
function Zt(e) {
	let t = getComputedStyle(e).backgroundColor.match(/\d+(?:\.\d+)?/g);
	return !t || (Number(t[0]) + Number(t[1]) + Number(t[2])) / 765 < .5 ? {
		ink: "rgba(235, 235, 235, 0.9)",
		faint: "rgba(235, 235, 235, 0.35)"
	} : {
		ink: "rgba(25, 25, 25, 0.85)",
		faint: "rgba(25, 25, 25, 0.35)"
	};
}
function Qt(e, t, n, r) {
	let i = document.createElement("canvas");
	i.width = n, i.height = n;
	let a = i.getContext("2d");
	if (!a) return i;
	let o = new Uint32Array(n * n), s = n / 2;
	for (let i = 0; i < e.count; i++) {
		let [a, c] = wt(e.points[i * 2], e.points[i * 2 + 1], t), l = Math.round(s + a * r), u = Math.round(s - c * r);
		l >= 0 && l < n && u >= 0 && u < n && o[u * n + l]++;
	}
	let c = jt(2 * r, e.count), l = a.createImageData(n, n), u = l.data;
	for (let e = 0; e < n; e++) for (let t = 0; t < n; t++) {
		let r = o[e * n + t];
		if (r === 0) continue;
		let i = Nt(r, c), a = xt(Math.atan2(s - e, t - s)), l = Xt[Math.floor(a * Wt) % Wt], d = Gt * i, f = (e * n + t) * 4;
		u[f] = Math.round(255 * (l[0] * (1 - d) + d)), u[f + 1] = Math.round(255 * (l[1] * (1 - d) + d)), u[f + 2] = Math.round(255 * (l[2] * (1 - d) + d)), u[f + 3] = Math.round(255 * i);
	}
	return a.putImageData(l, 0, 0), i;
}
function $t(e, t) {
	return e.rule === 9 ? Et(e.customHues.slice(0, e.customNodes).map(k), t) : Dt(e.rule, j(e), t);
}
function en(e, t, n, r, i, a) {
	e.beginPath();
	for (let o of t) {
		let t = i * (a === "log" ? St(o.radius, 1) : o.radius);
		e.moveTo(n, r), e.arc(n, r, t, -H(o.a0), -H(o.a1), !0), e.closePath();
	}
}
function tn(e, t, n, r, i) {
	if (r) return Fe(e, kt(T.length, e.rule, i));
	if (e.rule === 9) {
		let r = n ? 1 / 360 : 15 / 360;
		return {
			...e,
			customHues: e.customHues.map((n, i) => i < e.customNodes ? A(Se(k(n) + t * r)) : n)
		};
	}
	let a = Ot(n ? "fine" : "coarse", j(e), t);
	return {
		...e,
		anchorHue: A(a / 360)
	};
}
function nn() {
	let { useEffect: e, useRef: t, useState: n } = B().react, r = B().stores.useDevelopStore, i = U()((e) => e.sample), a = r((e) => e.paramBag), [o, s] = n(240), [c, l] = n(0), u = t(null), d = t(null), f = t(null), p = t(null);
	e(() => zt(), []), e(() => B().settings.onChange(() => l((e) => e + 1)), []), e(() => {
		let e = u.current;
		if (!e) return;
		let t = new ResizeObserver((e) => {
			let t = e[0].contentRect.width;
			t > 0 && s(Math.round(t));
		});
		return t.observe(e), () => t.disconnect();
	}, []);
	let m = () => {
		p.current !== null && window.clearTimeout(p.current), p.current = window.setTimeout(() => {
			p.current = null, r.getState().commitEdit("Colour Harmony");
		}, Bt);
	};
	e(() => () => {
		p.current !== null && (window.clearTimeout(p.current), r.getState().commitEdit("Colour Harmony"));
	}, []), e(() => {
		let e = d.current;
		if (!e) return;
		let t = (e) => {
			e.preventDefault();
			let t = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? -e.deltaX : e.deltaY, n = t > 0 ? 1 : t < 0 ? -1 : 0;
			if (n === 0) return;
			if (e.shiftKey) {
				let e = qt(), t = q[kt(q.length, q.indexOf(e.guideWidth), n)];
				B().settings.set(K.guideWidth, t), l((e) => e + 1);
				return;
			}
			let i = (Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY) > 0 ? 1 : -1, a = r.getState();
			a.photoId && (a.setDynParams(z(tn(R(a.paramBag), n, e.ctrlKey, e.altKey, i))), m());
		};
		return e.addEventListener("wheel", t, { passive: !1 }), () => e.removeEventListener("wheel", t);
	}, []), e(() => {
		let e = d.current;
		if (!e) return;
		let t = window.devicePixelRatio || 1, n = o;
		e.width = Math.round(n * t), e.height = Math.round(n * t);
		let r = e.getContext("2d");
		if (!r) return;
		r.setTransform(t, 0, 0, t, 0, 0), r.clearRect(0, 0, n, n);
		let s = qt(), c = R(a), { ink: l, faint: u } = Zt(e), p = n / 2, m = n / 2, h = n / 2 - Ht;
		if (h <= 4) return;
		let g = r.createConicGradient(0, p, m);
		for (let e = 0; e <= J; e++) {
			let t = xt(-e / J * 2 * Math.PI);
			g.addColorStop(e / J, Jt(Yt[Math.round(t * J) % J], .85));
		}
		r.lineWidth = Vt, r.strokeStyle = g, r.beginPath(), r.arc(p, m, h, 0, 2 * Math.PI), r.stroke();
		for (let e = 0; e < 6; e++) {
			let t = H(e / 6);
			r.beginPath(), r.arc(p + h * Math.cos(t), m - h * Math.sin(t), Ut, 0, 2 * Math.PI), r.fillStyle = Jt(Yt[e * J / 6]), r.fill(), r.lineWidth = 1, r.strokeStyle = u, r.stroke();
		}
		let _ = gt[s.guideWidth], v = $t(c, _);
		if (i) {
			let e = {
				sample: i,
				scale: s.scale,
				sizePx: Math.round(n * t)
			}, a = f.current;
			(!a || !Mt(a, e)) && (a = {
				...e,
				canvas: Qt(i, s.scale, e.sizePx, h * t)
			}, f.current = a);
			let o = a.canvas, c = _ > 0 && v.length > 0;
			r.save(), r.globalAlpha = c ? s.dim : 1, r.drawImage(o, 0, 0, n, n), r.restore(), c && (r.save(), en(r, v, p, m, h, s.scale), r.clip(), r.drawImage(o, 0, 0, n, n), r.restore());
		} else f.current = null;
		if (v.length > 0) {
			en(r, v, p, m, h, s.scale), r.lineWidth = 1, r.strokeStyle = l, r.stroke(), r.font = "11px var(--font-mono), monospace", r.fillStyle = l, r.textBaseline = "bottom";
			let e = T[c.rule]?.label ?? "";
			r.fillText(c.rule === 9 ? e : `${j(c)}°  ${e}`, 6, n - 5);
		}
	}, [
		i,
		a,
		o,
		c
	]);
	let h = {
		width: o,
		height: o,
		display: "block",
		borderRadius: 4,
		background: B().ui.tokens.surface0,
		touchAction: "none"
	};
	return V("div", {
		ref: u,
		style: { width: "100%" }
	}, V("canvas", {
		ref: d,
		style: h,
		title: Kt
	}));
}
//#endregion
//#region src/Panel.ts
var rn = 24, an = 8, on = .85, sn = (e) => `rgb(${Math.round(e[0] * 255)}, ${Math.round(e[1] * 255)}, ${Math.round(e[2] * 255)})`, Y = null;
function cn() {
	if (Y) return Y;
	let e = [];
	for (let t = 0; t <= rn; t++) {
		let n = t / rn;
		e.push(`${sn(nt(n * 360))} ${(n * 100).toFixed(2)}%`);
	}
	return Y = `linear-gradient(to right, ${e.join(", ")})`, Y;
}
var ln = /* @__PURE__ */ new Map();
function un(e) {
	let t = Math.round(e * 1e3), n = ln.get(t);
	if (n) return n;
	let r = De(e), i = r * on, a = [];
	for (let t = 0; t <= an; t++) {
		let n = t / an, o = n <= .5 ? n * 2 * i : i + (n - .5) * 2 * (r - i);
		a.push(`${sn(Oe(e, o))} ${(n * 100).toFixed(2)}%`);
	}
	let o = `linear-gradient(to right, ${a.join(", ")})`;
	return ln.set(t, o), o;
}
var dn = k(E.anchorHue) * 360;
function fn() {
	let { Slider: e, Panel: t } = B().components, { Button: n, Select: r, Row: i, Stack: a, ColourField: o, tokens: s } = B().ui, c = B().develop.useParamScope(), l = c.maskId !== null, u = U()((e) => e.sample), d = R(c.getParams()), f = d.rule === 9, p = M(d), m = () => R(c.getParams()), h = (e) => c.setParams(z(e)), g = (e) => c.commit(`Colour Harmony ${e}`), _ = (t, n, r, i, a, o, s, c) => V(e, {
		key: t,
		label: t,
		value: n,
		min: r,
		max: i,
		step: a,
		defaultValue: o,
		trackBackground: c,
		onChange: (e) => h(s(m(), e)),
		onCommit: () => g(t.toLowerCase())
	}), v = (e, t) => V("div", {
		key: t,
		style: {
			width: 22,
			height: 22,
			flex: "0 0 auto",
			borderRadius: 4,
			background: sn(ke(e)),
			border: `1px solid ${s.border}`
		}
	}), ee = V(i, {
		key: "rule",
		gap: 6
	}, V("div", { style: {
		flex: "1 1 auto",
		minWidth: 0
	} }, V(r, {
		value: String(d.rule),
		ariaLabel: "Harmony rule",
		options: T.map((e) => ({
			value: String(e.id),
			label: e.label
		})),
		onChange: (e) => {
			h(Fe(m(), Number(e))), g("rule");
		}
	})), l ? null : V(n, {
		size: "sm",
		disabled: !u,
		title: "Infer from the image: score every rule and anchor against the image's hue distribution and pick the palette it already covers best",
		onClick: () => {
			let e = U().getState().sample;
			if (!e) return;
			let t = Re(e.histogram);
			h({
				...m(),
				rule: t.rule,
				anchorHue: t.anchor
			}), g("infer");
		}
	}, "Infer")), te = (e, t, n, r) => _(e, k(t) * 360, 0, 360, .5, n, (e, t) => r(e, A(t / 360)), cn()), y = (e, t, n, r, i, s) => {
		let c = k(r) * 360;
		return V(a, {
			key: e,
			gap: 1
		}, V(o, {
			label: t,
			hue: c,
			title: "Click to choose the hue; the eyedropper takes it from the image",
			toRgb: (e) => nt(e),
			fromRgb: (e) => ({
				hue: rt(e, c),
				saturation: 100,
				lightness: 50
			}),
			pick: { paramBag: it },
			onChange: (e) => h(s(m(), A((e.hue % 360 + 360) % 360 / 360))),
			onCommit: () => g(n.toLowerCase())
		}), te(n, r, i, s));
	}, b = f ? null : y("anchor", "Anchor colour", "Anchor hue", d.anchorHue, dn, (e, t) => ({
		...e,
		anchorHue: t
	})), ne = f ? [_("Nodes", d.customNodes, 2, 4, 1, E.customNodes, (e, t) => ({
		...e,
		customNodes: Math.round(t)
	})), ...d.customHues.slice(0, d.customNodes).map((e, t) => y(`custom-${t}`, `Colour ${t + 1}`, `Hue ${t + 1}`, e, E.customHues[t] * 360, (e, n) => ({
		...e,
		customHues: e.customHues.map((e, r) => r === t ? n : e)
	})))] : null, re = f ? null : V(i, {
		key: "swatches",
		gap: 6
	}, ...p.nodes.map((e, t) => v(e, `node-${t}`)), V("span", { style: {
		fontSize: "10px",
		color: s.textMuted,
		marginLeft: "auto"
	} }, `${p.count} node${p.count === 1 ? "" : "s"}`)), x = [
		_("Pull strength", d.pullStrength, 0, 1, .01, E.pullStrength, (e, t) => ({
			...e,
			pullStrength: t
		})),
		_("Pull width", d.pullWidth, .25, 4, .01, E.pullWidth, (e, t) => ({
			...e,
			pullWidth: t
		})),
		_("Neutral protection", d.neutralProtection, 0, 1, .01, E.neutralProtection, (e, t) => ({
			...e,
			neutralProtection: t
		})),
		_("Smoothing", d.smoothing, 0, 2, .01, E.smoothing, (e, t) => ({
			...e,
			smoothing: t
		}))
	], S = V(t, {
		key: "saturation",
		title: "Saturation",
		defaultOpen: !1
	}, V(a, { gap: 1 }, ...p.nodes.map((e, t) => _(`Hue ${t + 1} saturation`, Math.round(d.nodeSat[t] * 100), 0, 200, 1, 100, (e, n) => ({
		...e,
		nodeSat: e.nodeSat.map((e, r) => r === t ? n / 100 : e)
	}), un(e)))));
	return V(a, {
		gap: 6,
		style: { padding: "6px 8px 8px" }
	}, l ? null : V(nn, { key: "scope" }), ee, b, ...ne ?? [], re, V("div", {
		key: "effect",
		style: {
			display: "flex",
			flexDirection: "column",
			gap: "1px"
		}
	}, ...x), S);
}
var pn = Math.sqrt(85), mn = 4096, hn = 8, gn = 1.5;
function _n(e) {
	let t = e.toPrecision(10);
	if (!t.includes("e")) return t.includes(".") ? t : `${t}.0`;
	let [n, r] = t.split("e");
	return `${n.includes(".") ? n : `${n}.0`}e${r}`;
}
var X = _n, Z = (e) => `vec3(${e.map(X).join(", ")})`, Q = (e) => `vec2(${e.map(X).join(", ")})`, vn = (e) => `mat3(${[
	0,
	3,
	6,
	1,
	4,
	7,
	2,
	5,
	8
].map((t) => X(e[t])).join(", ")})`, yn = `
float chLStar(float Y) {
  float yh = pow(max(Y, 0.0), ${X(a)});
  return ${X(r)} * yh / (yh + ${X(o)});
}
float chYOfLStar(float L) {
  return pow(${X(o)} * L / (${X(r)} - L), ${X(s)});
}
float chSafeDiv(float d) { return d >= 0.0 ? max(${X(b)}, d) : min(-${X(b)}, d); }
vec3 chXyY(vec3 xyz) {
  xyz = max(xyz, 0.0);
  float s = xyz.x + xyz.y + xyz.z;
  return s > 0.0 ? vec3(xyz.xy / s, xyz.y) : vec3(${X(n[0])}, ${X(n[1])}, xyz.y);
}
vec3 chXyz(vec3 xyY) {
  if (xyY.y == 0.0) return vec3(0.0);
  return vec3(xyY.z * xyY.x / xyY.y, xyY.z, xyY.z * (1.0 - xyY.x - xyY.y) / xyY.y);
}
// Scene-linear RGB -> (J, C, hue turn in [0, 1)).
vec3 chJch(vec3 lin) {
  const mat3 toXyz = ${vn(e)};
  vec3 xyY = chXyY(toXyz * lin);
  vec3 uvd = ${Z(f)} * xyY.x + ${Z(p)} * xyY.y + ${Z(m)};
  vec2 uv = uvd.xy / chSafeDiv(uvd.z);
  vec2 uvs = ${Q(h)} * uv / (abs(uv) + ${Q(g)});
  vec2 p = vec2(${X(_[0])} * uvs.x + ${X(_[1])} * uvs.y,
                ${X(_[2])} * uvs.x + ${X(_[3])} * uvs.y);
  float L = chLStar(xyY.z);
  float C = ${X(c)} * pow(L, ${X(l)}) * pow(dot(p, p), ${X(u)}) / ${X(x)};
  float hue = (atan(p.y, p.x) + ${X(Math.PI)}) / ${X(2 * Math.PI)};
  return vec3(L / ${X(x)}, C, hue);
}
// (J, C, hue turn) -> scene-linear RGB.
vec3 chRgb(vec3 jch) {
  const mat3 toRgb = ${vn(t)};
  float L = clamp(jch.x * ${X(x)}, 0.0, ${X(i)});
  float M = L != 0.0
    ? pow(jch.y * ${X(x)} / (${X(c)} * pow(L, ${X(l)})), ${X(d)})
    : 0.0;
  float H = jch.z * ${X(2 * Math.PI)} - ${X(Math.PI)};
  vec2 p = M * vec2(cos(H), sin(H));
  vec2 uvs = vec2(${X(v[0])} * p.x + ${X(v[1])} * p.y,
                  ${X(v[2])} * p.x + ${X(v[3])} * p.y);
  vec2 uv = -${Q(g)} * uvs / (abs(uvs) - ${Q(h)});
  vec3 xyD = ${Z(ee)} * uv.x + ${Z(te)} * uv.y + ${Z(y)};
  vec3 xyY = vec3(xyD.xy / chSafeDiv(xyD.z), chYOfLStar(L));
  return toRgb * chXyz(xyY);
}
float chAt(vec4 v, int i) { return i == 0 ? v.x : (i == 1 ? v.y : (i == 2 ? v.z : v.w)); }
float chWrap(float h) { return h - floor(h); }
// Pull toward the nearest node: (weighted hue shift, its Gaussian weight, winner).
// Names here, comments included, stay clear of the uniform keys the host rewrites.
vec3 chPull(float hue, vec4 nodeHues, int n, float zoneWidth) {
  if (n <= 0) return vec3(0.0);
  float sigma = zoneWidth * 0.5 / float(n);
  float inv2s2 = 1.0 / (2.0 * sigma * sigma);
  float maxW = 0.0;
  float diffW = 0.0;
  int win = 0;
  for (int i = 0; i < 4; i++) {
    if (i >= n) break;
    float node = chAt(nodeHues, i);
    float d = abs(hue - node);
    if (d > 0.5) d = 1.0 - d;
    float w = exp(-d * d * inv2s2);
    float diff = node - hue;
    if (diff > 0.5) diff -= 1.0; else if (diff < -0.5) diff += 1.0;
    if (w > maxW) { maxW = w; win = i; diffW = diff; }
  }
  return vec3(diffW * maxW, maxW, float(win));
}
// Add a (hue shift, saturation delta) correction to a pixel as a change in
// RGB, so what the UCS round trip of its JCH can't carry (channels below
// zero, light past its limit) passes through. Version 1 replaces the pixel.
vec3 chFinish(vec3 rgb, vec3 jch, float hueShift, float satDelta, float pull, float neutral) {
  float cutoff = neutral * neutral * neutral * ${X(.03)};
  float cw = jch.y / (jch.y + cutoff + ${X(1e-5)});
  float hue = chWrap(jch.z + hueShift * pull * cw);
  float C = max(jch.y * (1.0 + satDelta * cw), 0.0);
#if SL_PROCESS_VERSION >= 2
  return rgb + chRgb(vec3(jch.x, C, hue)) - chRgb(jch);
#else
  return chRgb(vec3(jch.x, C, hue));
#endif
}
`, bn = "\n{\n  if (smoothing <= 0.0 && (pullStrength > 0.0 || any(notEqual(nodeSat, vec4(1.0))))) {\n    int n = int(nodeCount + 0.5);\n    vec3 jch = chJch(max(lin, 0.0));\n    vec3 pull = chPull(jch.z, nodes, n, pullWidth);\n    float satDelta = (chAt(nodeSat, int(pull.z)) - 1.0) * pull.y;\n    lin = chFinish(lin, jch, pull.x, satDelta, pullStrength, neutralProtection);\n  }\n}\n", xn = {
	rule: {
		min: 0,
		max: 9,
		step: 1
	},
	anchorHue: {
		min: 0,
		max: 1,
		step: .001
	},
	customNodes: {
		min: 2,
		max: 4,
		step: 1
	},
	pullStrength: {
		min: 0,
		max: 1,
		step: .01
	},
	pullWidth: {
		min: .25,
		max: 4,
		step: .01
	},
	neutralProtection: {
		min: 0,
		max: 1,
		step: .01
	},
	smoothing: {
		min: 0,
		max: 2,
		step: .01
	}
}, Sn = {
	rule: "harmony rule",
	anchorHue: "anchor hue",
	customHues: "custom node hues",
	customNodes: "nodes",
	nodeSat: "node saturation",
	pullStrength: "pull strength",
	pullWidth: "pull width",
	neutralProtection: "neutral color protection",
	smoothing: "smoothing",
	nodes: "harmony nodes",
	nodeCount: "node count"
};
function Cn() {
	let e = E, { nodes: t, count: n } = M(e), r = [
		...t,
		0,
		0,
		0,
		0
	].slice(0, 4), i = {
		rule: e.rule,
		anchorHue: e.anchorHue,
		customHues: [...e.customHues],
		customNodes: e.customNodes,
		nodeSat: [...e.nodeSat],
		pullStrength: e.pullStrength,
		pullWidth: e.pullWidth,
		neutralProtection: e.neutralProtection,
		smoothing: e.smoothing,
		nodes: r,
		nodeCount: n
	};
	return P.map((e) => ({
		key: e,
		glslType: Array.isArray(i[e]) ? "vec4" : "float",
		default: i[e],
		range: xn[e],
		label: Sn[e]
	}));
}
function wn() {
	return {
		id: Ue,
		name: "Colour Harmony",
		phase: "scene-linear",
		priority: 80,
		glsl: bn,
		helpers: yn,
		uniforms: Cn(),
		presetScope: "global",
		mask: { maskable: !0 }
	};
}
var Tn = "\n{\n  int n = int(nodeCount + 0.5);\n  vec3 jch = chJch(max(c, 0.0));\n  vec3 pull = chPull(jch.z, nodes, n, pullWidth);\n  float satDelta = (chAt(nodeSat, int(pull.z)) - 1.0) * pull.y;\n  c = vec3(pull.x, satDelta, 0.0);\n}\n", En = `
{
  int level = uPassIndex / 2;
  bool horizontal = (uPassIndex - 2 * level) == 0;
  float longEdge = max(1.0 / uTexel.x, 1.0 / uTexel.y);
#if SL_PROCESS_VERSION >= 2
  float sigma = blur * max(${X(gn)}, ${X(hn)} * longEdge / max(uSourceSize.x, uSourceSize.y));
#else
  float sigma = blur * max(${X(1.5)}, 8.0 * longEdge / ${X(mn)});
#endif
  float dil = sigma / ${X(pn)} * exp2(float(level));
  vec2 step = (horizontal ? vec2(uTexel.x, 0.0) : vec2(0.0, uTexel.y)) * dil;
  vec3 acc = 0.375 * c;
  for (int k = 1; k <= 2; k++) {
    float w = k == 1 ? 0.25 : 0.0625;
    acc += w * (readPrev(vUv + float(k) * step) + readPrev(vUv - float(k) * step));
  }
  c = acc;
}
`, Dn = "\n{\n  if (on > 0.5) {\n    vec3 jch = chJch(max(lin, 0.0));\n    lin = chFinish(lin, jch, stageResult.x, stageResult.y, pullStrength, neutralProtection);\n  }\n}\n", $ = (e, t) => ({
	key: e,
	glslType: t,
	default: t === "vec4" ? [
		0,
		0,
		0,
		0
	] : 0
}), On = [
	$("nodes", "vec4"),
	$("nodeCount", "float"),
	$("nodeSat", "vec4"),
	$("pullWidth", "float")
], kn = [$("blur", "float")], An = [
	$("pullStrength", "float"),
	$("neutralProtection", "float"),
	$("on", "float")
];
function jn() {
	return {
		id: We,
		name: "Colour Harmony · smoothing",
		phase: "scene-linear",
		priority: 81,
		reads: "current",
		readsCurrentFrom: 2,
		glsl: Dn,
		helpers: yn,
		uniforms: An,
		passes: [{
			glsl: Tn,
			helpers: yn,
			iterations: 1,
			uniforms: On
		}, {
			glsl: En,
			iterations: 8,
			uniforms: kn
		}],
		presetScope: "global",
		mask: { maskable: !0 }
	};
}
function Mn() {
	return [wn(), jn()];
}
//#endregion
//#region src/index.ts
var Nn = `${N}.panel`, Pn = null;
function Fn() {
	let e = B().stores.useDevelopStore.getState();
	e.setDynParams(Qe()), e.commitEdit("Colour Harmony reset");
}
function In(e) {
	ot(e), Ft();
	for (let t of Mn()) e.registerProcessingStage(t);
	e.registerPanel({
		id: Nn,
		title: "Colour Harmony",
		component: fn,
		defaultDock: {
			module: "develop",
			direction: "right",
			order: 7,
			width: 268
		},
		onReset: Fn,
		mask: {
			component: fn,
			owns: Ke
		}
	}), e.registerSettings({
		title: "Colour Harmony",
		keywords: [
			"vectorscope",
			"harmony",
			"guides"
		],
		fields: [
			{
				key: K.scale,
				label: "Vectorscope scale",
				type: "select",
				default: "log",
				options: [{
					value: "log",
					label: "Logarithmic"
				}, {
					value: "linear",
					label: "Linear"
				}]
			},
			{
				key: K.guideWidth,
				label: "Guide width",
				hint: "Shift+scroll on the scope cycles this too.",
				type: "select",
				default: "normal",
				options: q.map((e) => ({
					value: e,
					label: e[0].toUpperCase() + e.slice(1)
				}))
			},
			{
				key: K.dim,
				label: "Dim outside guides",
				hint: "How much of the plot shows outside the harmony sectors (darktable: 0.7).",
				type: "number",
				default: yt,
				min: 0,
				max: 1,
				step: .05
			}
		]
	}), Pn = e.stores.useDevelopStore.subscribe((e, t) => {
		if (e.paramBag === t.paramBag) return;
		let n = et(e.paramBag);
		n && e.setDynParams(n);
	});
}
function Ln() {
	Pn?.(), Pn = null;
	try {
		let e = B();
		for (let t of Mn()) e.unregisterProcessingStage(t.id);
	} catch {}
}
//#endregion
export { In as activate, Ln as deactivate };

//# sourceMappingURL=index.js.map