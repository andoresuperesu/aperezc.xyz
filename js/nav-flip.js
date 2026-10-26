/*
 * When the window crosses the 1700px breakpoint, the side card's picture and
 * buttons and the header's contact buttons fly to their places in the top bar
 * (and back). Each real element is animated from where it was to where it now
 * is (FLIP), so no clones are needed. Without JS, or with reduced motion, the
 * CSS fade/slide in resume.scss is used instead.
 */
(function () {
	if (!window.matchMedia || !Element.prototype.animate) return;

	var root = document.documentElement;
	var mq = window.matchMedia('(max-width: 1700px)');
	var reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
	var DURATION = 450;
	var EASING = 'cubic-bezier(0.2, 0.8, 0.2, 1)';

	function all(selector) {
		return Array.prototype.slice.call(document.querySelectorAll(selector));
	}

	// [element shown on wide screens, element shown below 1701px]
	var pairs = [];
	[
		['.card.floating-left img', '.topnav-avatar img'],
		['.card.floating-left .pagelinks', '.topnav .pagelinks'],
		['.hd-contact .paper-btn', '.topnav-contact .paper-btn']
	].forEach(function (group) {
		var wide = all(group[0]);
		var narrow = all(group[1]);
		wide.forEach(function (el, i) {
			if (narrow[i]) pairs.push({ wide: el, narrow: narrow[i] });
		});
	});
	if (!pairs.length) return;

	var card = document.querySelector('.card.floating-left');
	var blocks = all('#hd, #bd, #ft');
	var compact = mq.matches;
	var snapshot = null;
	var running = [];

	root.classList.add('js-flip');

	function visible(pair) {
		return compact ? pair.narrow : pair.wide;
	}

	function measure() {
		snapshot = {
			rects: pairs.map(function (pair) { return visible(pair).getBoundingClientRect(); }),
			tops: blocks.map(function (block) { return block.getBoundingClientRect().top; })
		};
	}

	function play(el, keyframes) {
		var animation = el.animate(keyframes, { duration: DURATION, easing: EASING });
		running.push(animation);
		return animation;
	}

	function fly(from) {
		running.forEach(function (animation) { animation.cancel(); });
		running = [];
		if (reduce.matches || !from) return;

		pairs.forEach(function (pair, i) {
			var el = visible(pair);
			var start = from.rects[i];
			var end = el.getBoundingClientRect();
			if (!end.width || !end.height || !start.width || !start.height) return;
			el.style.transformOrigin = '0 0';
			play(el, [
				{
					transform: 'translate(' + (start.left - end.left) + 'px, ' + (start.top - end.top) + 'px) ' +
						'scale(' + (start.width / end.width) + ', ' + (start.height / end.height) + ')'
				},
				{ transform: 'none' }
			]);
		});

		// content below the top bar glides instead of jumping
		blocks.forEach(function (block, i) {
			var dy = from.tops[i] - block.getBoundingClientRect().top;
			if (Math.abs(dy) > 1) play(block, [{ transform: 'translateY(' + dy + 'px)' }, { transform: 'none' }]);
		});

		if (card) {
			// the card frame fades in when it appears, and out (kept visible meanwhile) when it leaves
			play(card, compact
				? [{ opacity: 1, visibility: 'visible', transform: 'none' }, { opacity: 0, visibility: 'visible', transform: 'none' }]
				: [{ opacity: 0 }, { opacity: 1 }]);
		}
	}

	function onResize() {
		if (mq.matches === compact) {
			measure();
			return;
		}
		var from = snapshot;
		compact = mq.matches;
		fly(from);
		measure();
	}

	var scheduled = false;
	function onScroll() {
		if (scheduled) return;
		scheduled = true;
		window.requestAnimationFrame(function () {
			scheduled = false;
			measure();
		});
	}

	window.addEventListener('resize', onResize, { passive: true });
	if (mq.addEventListener) mq.addEventListener('change', onResize);
	window.addEventListener('scroll', onScroll, { passive: true });
	// initial measurements: adopt the current state without animating
	function settle() {
		compact = mq.matches;
		measure();
	}
	window.addEventListener('load', settle);
	if (document.fonts && document.fonts.ready) document.fonts.ready.then(settle);
	settle();
})();
