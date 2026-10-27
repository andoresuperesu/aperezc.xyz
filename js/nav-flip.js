/*
 * The navigation has three layouts, and the page animates between them (FLIP):
 *   wide   (over 1455px)       side card with the picture and nav buttons; contact buttons in the header
 *   mid    (601-1455px)        top bar with the picture, nav buttons and, on the right, the contact buttons
 *   narrow (600px and under)   top bar with picture and nav buttons; contact buttons below the subtitle
 * When the window crosses a breakpoint, each button travels from where it was to where it now is along
 * an S-shaped curve (down first, then sweeping sideways into place), one button after another.
 * No clones are needed: the real elements are animated. Without JS, or with reduced motion, the CSS
 * fade/slide in resume.scss is used instead. Keep the breakpoints in sync with resume.scss.
 */
(function () {
	if (!window.matchMedia || !Element.prototype.animate) return;

	var root = document.documentElement;
	var mqCompact = window.matchMedia('(max-width: 1455px)');
	var mqNarrow = window.matchMedia('(max-width: 600px)');
	var reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
	var DURATION = 520;   // ms each button takes
	var STAGGER = 60;     // ms between one button starting and the next
	var SAMPLES = 30;     // keyframes per button along the curve

	// the same easing the content blocks use (cubic-bezier(0.2, 0.8, 0.2, 1)), also evaluated here
	var EASING = 'cubic-bezier(0.2, 0.8, 0.2, 1)';
	var ease = cubicBezier(0.2, 0.8, 0.2, 1);

	function cubicBezier(x1, y1, x2, y2) {
		var cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
		var cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
		function sampleX(t) { return ((ax * t + bx) * t + cx) * t; }
		function sampleY(t) { return ((ay * t + by) * t + cy) * t; }
		function slopeX(t) { return (3 * ax * t + 2 * bx) * t + cx; }
		return function (x) {
			if (x <= 0) return 0;
			if (x >= 1) return 1;
			var t = x, i, d;
			for (i = 0; i < 8; i++) {
				d = sampleX(t) - x;
				if (Math.abs(d) < 1e-5) return sampleY(t);
				var slope = slopeX(t);
				if (Math.abs(slope) < 1e-6) break;
				t -= d / slope;
			}
			var lo = 0, hi = 1;
			t = x;
			for (i = 0; i < 20; i++) {
				d = sampleX(t) - x;
				if (Math.abs(d) < 1e-5) break;
				if (d > 0) hi = t; else lo = t;
				t = (lo + hi) / 2;
			}
			return sampleY(t);
		};
	}

	function all(selector) {
		return Array.prototype.slice.call(document.querySelectorAll(selector));
	}

	// [element in the wide layout, in the mid layout, in the narrow layout]
	var items = [];
	[
		['.card.floating-left img', '.topnav-avatar img', '.topnav-avatar img'],
		['.card.floating-left .pagelinks', '.topnav .pagelinks', '.topnav .pagelinks'],
		['.hd-contact .paper-btn', '.topnav-contact .paper-btn', '.hd-contact .paper-btn']
	].forEach(function (group) {
		var lists = group.map(all);
		lists[0].forEach(function (el, i) {
			if (lists[1][i] && lists[2][i]) items.push({ wide: el, mid: lists[1][i], narrow: lists[2][i] });
		});
	});
	if (!items.length) return;

	var card = document.querySelector('.card.floating-left');
	var blocks = all('#hd, #bd, #ft');
	var snapshot = null;
	var running = [];
	var flying = false;   // while buttons are in flight their rects are not their resting places
	var flightId = 0;

	var RANK = { narrow: 0, mid: 1, wide: 2 };

	function layout() {
		if (!mqCompact.matches) return 'wide';
		return mqNarrow.matches ? 'narrow' : 'mid';
	}

	var state = layout();
	root.classList.add('js-flip');

	function measure() {
		snapshot = {
			rects: items.map(function (item) { return item[state].getBoundingClientRect(); }),
			tops: blocks.map(function (block) { return block.getBoundingClientRect().top; })
		};
	}

	function play(el, keyframes, options) {
		var animation = el.animate(keyframes, options);
		running.push(animation);
		return animation;
	}

	// Offsets are relative to the button's final place: (0, 0) means "arrived".
	// Cubic Bezier with vertical tangent at the start and horizontal tangent at the end, which
	// draws an S when both dx and dy are large and degrades to a straight line when one is zero.
	function curvePoint(u, dx, dy) {
		var p0x = dx, p0y = dy;
		var p1x = dx, p1y = dy * 0.5;
		var p2x = dx * 0.4, p2y = 0;
		var p3x = 0, p3y = 0;
		var v = 1 - u;
		var a = v * v * v, b = 3 * v * v * u, c = 3 * v * u * u, d = u * u * u;
		return [a * p0x + b * p1x + c * p2x + d * p3x, a * p0y + b * p1y + c * p2y + d * p3y];
	}

	function fly(from, previous) {
		running.forEach(function (animation) { animation.cancel(); });
		running = [];
		flying = false;
		flightId++;
		if (reduce.matches || !from) return;

		// where the content blocks have to glide from; buttons inside a block ride along, so their
		// curve is corrected by the block's current offset to keep the path clean
		var blockShift = blocks.map(function (block, i) {
			var dy = from.tops[i] - block.getBoundingClientRect().top;
			return Math.abs(dy) > 1 ? dy : 0;
		});

		var moving = [];
		items.forEach(function (item, i) {
			var el = item[state];
			var start = from.rects[i];
			var end = el.getBoundingClientRect();
			if (!end.width || !end.height || !start.width || !start.height) return;
			var dx = start.left - end.left;
			var dy = start.top - end.top;
			var sx = start.width / end.width;
			var sy = start.height / end.height;
			if (Math.abs(dx) + Math.abs(dy) < 1 && Math.abs(sx - 1) + Math.abs(sy - 1) < 0.01) return;
			var shift = 0;
			blocks.forEach(function (block, b) { if (block.contains(el)) shift = blockShift[b]; });
			moving.push({ el: el, dx: dx, dy: dy, sx: sx, sy: sy, shift: shift });
		});

		// narrowing the window sends the buttons off in page order (picture, nav, Email, GitHub, LinkedIn);
		// widening runs the same sequence backwards (LinkedIn, GitHub, Email, nav, picture)
		if (RANK[state] > RANK[previous]) moving.reverse();

		var total = DURATION + Math.max(0, moving.length - 1) * STAGGER;

		moving.forEach(function (m, order) {
			var keyframes = [];
			for (var j = 0; j <= SAMPLES; j++) {
				var tau = (j / SAMPLES) * total;                      // ms since the transition began
				var u = Math.min(Math.max((tau - order * STAGGER) / DURATION, 0), 1);
				var progress = ease(u);                               // how far along the curve this button is
				var pt = curvePoint(progress, m.dx, m.dy);
				var blockOffset = m.shift * (1 - ease(Math.min(tau / DURATION, 1)));
				var scaleX = m.sx + (1 - m.sx) * progress;
				var scaleY = m.sy + (1 - m.sy) * progress;
				keyframes.push({
					offset: j / SAMPLES,
					transform: 'translate(' + pt[0] + 'px, ' + (pt[1] - blockOffset) + 'px) scale(' + scaleX + ', ' + scaleY + ')'
				});
			}
			keyframes[keyframes.length - 1].transform = 'none';
			m.el.style.transformOrigin = '0 0';
			play(m.el, keyframes, { duration: total, easing: 'linear' });
		});

		// content below the top bar and header glides instead of jumping
		blocks.forEach(function (block, i) {
			if (blockShift[i]) {
				play(block, [{ transform: 'translateY(' + blockShift[i] + 'px)' }, { transform: 'none' }], { duration: DURATION, easing: EASING });
			}
		});

		// the card frame fades in when it appears, and out (kept visible meanwhile) when it leaves
		if (card) {
			if (previous === 'wide') {
				play(card, [{ opacity: 1, visibility: 'visible', transform: 'none' }, { opacity: 0, visibility: 'visible', transform: 'none' }], { duration: DURATION, easing: EASING });
			} else if (state === 'wide') {
				play(card, [{ opacity: 0 }, { opacity: 1 }], { duration: DURATION, easing: EASING });
			}
		}

		// remeasure the resting places once everything has landed
		if (running.length) {
			var id = ++flightId;
			flying = true;
			var landed = function () {
				if (id !== flightId) return;
				flying = false;
				measure();
			};
			Promise.all(running.map(function (animation) { return animation.finished; })).then(landed, landed);
		}
	}

	function onResize() {
		var now = layout();
		if (now === state) {
			if (!flying) measure();
			return;
		}
		var from = snapshot;
		var previous = state;
		state = now;
		fly(from, previous);
		if (!flying) measure();
	}

	var scheduled = false;
	function onScroll() {
		if (scheduled) return;
		scheduled = true;
		window.requestAnimationFrame(function () {
			scheduled = false;
			if (!flying) measure();
		});
	}

	window.addEventListener('resize', onResize, { passive: true });
	if (mqCompact.addEventListener) {
		mqCompact.addEventListener('change', onResize);
		mqNarrow.addEventListener('change', onResize);
	}
	window.addEventListener('scroll', onScroll, { passive: true });

	// initial measurements: adopt the current layout without animating
	function settle() {
		state = layout();
		measure();
	}
	window.addEventListener('load', settle);
	if (document.fonts && document.fonts.ready) document.fonts.ready.then(settle);
	settle();
})();
