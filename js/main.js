'use strict';

/* --- DOM NODES --- */
const contentWrapper = document.getElementById('body__contentWrapper');

/* --- MENU --- */
function menuInit() {
	let menuOpen = false;
	let menuTransitioning = false;
	
	window.menuToggle = function(open) {
		if(open === undefined) open = !menuOpen;

		menuTransitioning = true;
		menuOpen = open;
		if(menuOpen) {
			contentWrapper.style.overflowX = 'hidden';
		}
		document.body.classList.toggle('js-menu-visible', menuOpen);
	};
	document.body.addEventListener('transitionend', function() {
		if(!menuOpen) contentWrapper.style.overflowX = 'unset';
		menuTransitioning = false;
	});

	document.getElementById('body__content').addEventListener('click', function(event) {
		if(!menuOpen) return;
		menuToggle();
		event.preventDefault();
		event.stopPropagation();
	});

	// --- CART --- //
	const cartButton = document.getElementById('menu__cartButton');
	const cartIndicator = document.getElementById('menu__cartIndicator');

	let cartIndicatorInterval = setInterval(function() {
		cartIndicator.classList.add('alert');
		setTimeout(function() { cartIndicator.classList.remove('alert'); }, 600);
	}, 8000);

	document.addEventListener('cart:added', function() {
		cartButton.classList.add('menu__cartButton--alert');
		cartIndicator.classList.remove('hidden');
		setTimeout(function() {
			cartButton.classList.remove('menu__cartButton--alert');
		}, 1000);
	});
	document.addEventListener('cart:updated', function(event) {
		cartIndicator.classList.toggle('hidden', !(event.cart && event.cart.lineItems.edges.length > 0));
	});
	
	document.addEventListener('pjax:success', function() {
		checkoutFetch().then((checkout) => {
			const event = new Event('cart:updated', {bubbles: true, cancelable: true});
			event.cart = checkout;
			document.dispatchEvent(event);
		});
	}, {once: true});
}

document.addEventListener('DOMContentLoaded', menuInit, {once: true});

/* --- ANIMATION --- */

const animObserver = new IntersectionObserver(handleAnimationIntersection, {rootMargin: '0px 0px -50px 0px', threshold: 0.0});

function animationInit() {
	animObserver.disconnect();
	document.documentElement.classList.add('js-enabled');
	document.querySelectorAll('.animation-container').forEach((el) => {
		animObserver.observe(el);
	});
}
		
function handleAnimationIntersection(entries, observer) {
	for(const entry of entries) {
		if(entry.isIntersecting) {
			entry.target.classList.remove('animation-container');
		}
	}
}

/* --- NAVIGATION --- */

let navigationPromise;

const pjax = new Pjax({
	selectors: [
		'title',
		'body', // only classes are modified
		'main', // content is replaced
		'#bodyTail',
	],
	switches: {
		'body': function(oldEl, newEl) {
			return new Promise(function(res) {
				// remove all classes on the body that aren't prefixed with `js-`
				Array.prototype.slice.call(oldEl.classList).forEach(function(cl) {
					if(cl.startsWith('js-')) return;
					oldEl.classList.remove(cl);
				});
				// add all classes from the new body
				newEl.classList.forEach(function(cl) {
					oldEl.classList.add(cl);
				});
				res();
			});
		},
		'main': function(oldEl, newEl) {
			return navigationPromise.then(() => {
				return Pjax.switches.default(oldEl, newEl);
			}).then(() => {
				document.body.classList.remove('js-loading');

				contentWrapper.addEventListener('transitionend', () => {
					document.documentElement.classList.remove('js-no-smooth-scroll');

					// HACK: Safari breaks object-fit on dynamically inserted images. Since we're using pjax, all navigations
					// are dynamically inserted. This hack unsets the src and srcset and then resets them, triggering a re-render.
					// FUUUUUU APPLE
					if(navigator.vendor == 'Apple Computer, Inc.') {
						contentWrapper.querySelectorAll('img').forEach(el => {
							const src = el.getAttribute('src');
							const srcset = el.getAttribute('srcset');
							if(src) {
								el.setAttribute('src', '');
								el.setAttribute('src', src);
							}
							if(srcset) {
								el.setAttribute('srcset', '');
								el.setAttribute('srcset', srcset);
							}
						});
					}

				}, {once: true});
			});
		},
		'#bodyTail': Pjax.switches.default,
	}
});

/* --- INIT --- */

function handleNavigationStart() {
	window.menuToggle(false);
	navigationPromise = new Promise((res) => {
		contentWrapper.addEventListener('transitionend', res, {once: true});
		document.body.classList.add('js-loading');
		document.documentElement.classList.add('js-no-smooth-scroll');
	});
}
function handleNavigationEnd() {
	animationInit();
}

document.addEventListener('pjax:send', handleNavigationStart);
document.addEventListener('pjax:success', handleNavigationEnd);



// NOTE: all page and component initializers are set up to listen to 'pjax:success', so this
// fires them once when the page first loads
document.addEventListener('DOMContentLoaded', function() {
	document.dispatchEvent(new Event('pjax:success', {bubbles: true, cancelable: true}));
}, {once: true});
