---
---

/* ==========================================================================
	Initialisation
========================================================================== */

const
	pool_url = "{{ site.data.tools.pool.url }}",
	currency = "{{ site.data.content.currency }}",
	jsonFeedUrl = "./assets/feeds/gifts.json",
	firebase_apiKey = {{ site.data.tools.firebase.apiKey | jsonify }},
	firebase_projectId = {{ site.data.tools.firebase.projectId | jsonify }},
	firebase_databaseURL = {{ site.data.tools.firebase.dbUrl | jsonify }},
	firebase_authDomain = firebase_projectId + '.firebaseapp.com',
	firebase_storageBucket = firebase_projectId + '.appspot.com';

var currentUserID;

import { initializeApp } from 'https://www.gstatic.com/firebasejs/9.17.1/firebase-app.js'
import { getDatabase, ref, onValue, update, query, orderByChild, startAt } from 'https://www.gstatic.com/firebasejs/9.17.1/firebase-database.js'
import { getAuth, onAuthStateChanged, signInAnonymously } from 'https://www.gstatic.com/firebasejs/9.17.1/firebase-auth.js'

const firebaseConfig = {
	apiKey: firebase_apiKey,
	authDomain: firebase_authDomain,
	databaseURL: firebase_databaseURL,
	storageBucket: firebase_storageBucket
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app);


$(document).ready(function() {

	/* ==========================================================================
		Lazy load / Image loading
	========================================================================== */
	var lazyLoadInstance = new LazyLoad({
		thresholds: "500% 0px"
	});

	/**
	 * Lazy load - image loading
	 */
	async function initiateLazyLoad() {
		var lazyLoadInstance = new LazyLoad({
			elements_selector: ".lazy",
		});
	}


	/* ==========================================================================
		Firebase
	========================================================================== */


	// Firebase - on auth change
	onAuthStateChanged(auth, (user) => {
		if (user) {
			currentUserID = user.uid;
		} else {
			currentUserID = undefined;
		}
	});

	// Firebase - anonymous auth
	signInAnonymously(auth)
		.then(() => {})
		.catch((error) => {
			var errorCode = error.code;
			var errorMessage = error.message;
		});

	if ($("body").hasClass("gifts-list")) {
		getListAvailability(currentUserID);
	} else if ($("body").hasClass("gift")) {
		getGiftAvailability(currentUserID);
	}


	// Retrieve and push Gift List Availability
	async function getListAvailability(currentUserID) {
		const queryAvailability = query(ref(db, "/products/"), orderByChild("amountLeft"), startAt(0));
		return onValue(queryAvailability, (snapshot) => {
			snapshot.forEach(function(child) {
				let product = child.key;
				let amountLeft = child.val().amountLeft;
				if (amountLeft == 0) {
					$(".element-item." + product + " .card")
						.addClass("unavailable")
						.find("a").each(function() {
							$(this).removeAttr("href")
						});
				} else {
					$(".element-item." + product + " .card")
						.addClass("partial_contribution")
						.find(".amountLeft")
						.text("restant: " + amountLeft + " " + currency)
				}
			})
		}, {
			onlyOnce: true
		})
	}

	// Retrieve and push single Gift Availability
	async function getGiftAvailability(currentUserID) {
		let slug = $('.container').attr("slug");
		return onValue(ref(db, "products/" + slug), (snapshot) => {

			if (snapshot.val() !== null && snapshot.val().amountLeft !== null) {
				let amountLeft = snapshot.val().amountLeft;
				if (amountLeft == 0) {
					$(".container").addClass("unavailable")
						.find("form.addtocart").remove()
				} else {
					$("#full").addClass("partial_contribution").prop("disabled", true);
					$("#contribution").attr("value", amountLeft).attr("initial_value", amountLeft).attr("max", amountLeft);
					$("#partial").prop("checked", true);
				}
			}
		}, {
			onlyOnce: true
		});
	}

	function confirmOrder() {
		if (currentUserID) {

			// set var
			let today = new Date();
			let date = today.getFullYear() + '-' + (today.getMonth() + 1) + '-' + today.getDate();
			let time = today.getHours() + ":" + today.getMinutes() + ":" + today.getSeconds();
			let dateTime = date + ' ' + time;
			let orderID = Date.now() + currentUserID.substring(currentUserID.length - 5);

			let pathOrders = "orders/" + dateTime + ' | ' + currentUserID;

			let name = $('#name').val();
			let message = $('#message').val();
			let totalAmount = 0;

			let cookie = Cookies.getJSON('cart') || [];

			let gifts_list = [];


			// firebase - update stock
			$.each(cookie, function(index) {

				let slug = cookie[index].slug;
				let product = cookie[index].product;
				let contribution = cookie[index].contribution;
				let price = Number(cookie[index].price);
				let pathProducts = "products/" + slug;
				let amountLeft;
				let availability;

				// Get product full price
				let jsonIndex;
				let fullPrice;
				
				// build gifts_list
				gifts_list.push(product + " (" + price + "€ | " + contribution + ")");

				$.ajax({
					url: jsonFeedUrl,
					async: false,
					dataType: 'json',
					success: function(data) {
						jsonIndex = data.findIndex(json => json.slug === slug);
						fullPrice = Number(data[jsonIndex].price);
					}
				});
				// check availability & set amountLeft
				onValue(ref(db, pathProducts), (snapshot) => {

					if (slug == "free-contribution") {
						availability = true;
					} else if (snapshot.val() !== null && snapshot.val().amountLeft !== null) {
						let currentAmountLeft = snapshot.val().amountLeft;
						if (currentAmountLeft == 0) {
							availability = false;
						} else {
							if (price > currentAmountLeft) {
								price = currentAmountLeft;
								contribution = 'partial';
							}
							availability = true;
							amountLeft = currentAmountLeft - price;
						}
					} else {
						availability = true;
						if (contribution == "full") {
							amountLeft = 0;
						} else {
							amountLeft = fullPrice - price;
						}
					}
					if (availability == true) {

						// set totalAmount
						totalAmount += price;
						$("#cartTotalAmount").text(totalAmount + ' ' + currency);

						// save new amountLeft to firebase
						if (slug !== "free-contribution") {
							let amountData = { amountLeft: amountLeft };
							let updates = {};
							updates[pathProducts] = amountData;
							
							$('#orderPayment').on('click', function() {
							return update(ref(db), updates);
							})
						}
					} else {
						// PRODUIT PAS DISPO
					}				
				}, {
					onlyOnce: true
				});
			});
			
			// modal
			modalON();

			// build firebase request
			let orderUid = { uid: currentUserID };
			let orderData = {
				orderID: orderID,
				name: name,
				date: dateTime,
				message: message,
				total: totalAmount,
				gifts: gifts_list
			};
			let updatesUid = {};
			let updatesData = {};
			updatesUid[pathOrders] = orderUid;
			updatesData[pathOrders+'/data'] = orderData;
			
			$('#orderPayment').on('click', function() {
				// save order to firebase
				update(ref(db), updatesUid);
				update(ref(db), updatesData);
				
				// delete cookies
				Cookies.remove('cart');
			});
		}
	}


	/* ==========================================================================
		Mobile hover replacement
	========================================================================== */

	(function($, win) {
		$.fn.inViewport = function(cb) {
			return this.each(function(i, el) {
				function visPx() {
					var elH = $(el).outerHeight(),
						H = $(win).height(),
						r = el.getBoundingClientRect(),
						t = r.top,
						b = r.bottom;
					return cb.call(el, Math.max(0, t > 0 ? Math.min(elH, H - t) : Math.min(b, H)));
				}
				visPx();
				$(win).on("resize scroll", visPx);
			});
		};
	}(jQuery, window));

	$(".card").inViewport(function(px) {
		if (px > 220) {
			$(this).addClass("visible");
		} else {
			$(this).removeClass("visible");
		}
	});

	/* ==========================================================================
		pool link
	========================================================================== */
	
	$('#contribute').on('click', function() {
		let name = $('.cart-form').find('input[name="name"]').val();
		let message = $('.cart-form').find('textarea[name="message"]').val();

		if (name == "" || message == "") {
			alert("Veuillez renseigner les informations avant de valider");
		}
		else {
			confirmOrder();
		}
	});


	/* ==========================================================================
		cart modal
	========================================================================== */

	function modalON() {
		$('#modalCenter').addClass("show");
		$('body').addClass("modal-open");
	}
	$('.modal-off').on('click', function() {
		if ($("body").hasClass("cart")) {
			window.location.href = "/"
		}
		$('#modalCenter').removeClass("show");
		$('body').removeClass("modal-open");
	});


	/* ==========================================================================
		cookie cart / add_to_cart
	========================================================================== */

	$('#addtocart').on('click', function() {
		let initial_cookie = Cookies.getJSON('cart') || [];
		var slug = $(this).attr('data-slug');
		var product = $(this).attr('data-product');
		var brand = $(this).attr('data-brand');
		var quantity = Number($(this).attr('data-quantity'));
		var contribution = $('input[name=contribution]:checked').attr('id');

		if (contribution == 'partial') {
			var price = Number($('#contribution').val());
		} else {
			var price = Number($('#contribution').attr('initial_value'));
		}

		let add_cookie = { "slug": slug, "product": product, "brand": brand, "price": price, "contribution": contribution, "quantity": quantity };

		var new_cookie = updateJSON(initial_cookie, add_cookie, slug);

		Cookies.set('cart', JSON.stringify(new_cookie), { expires: 7 })
	});

	function updateJSON(data, add_cookie, slug) {
		for (let i = 0; i < data.length; i++) {
			if (data[i].slug == slug) {
				var removeIndex = data.map(function(item) { return item.slug; }).indexOf(data[i].slug);
				data.splice(removeIndex, 1);
				return data;
			}
		}
		data.push(add_cookie);
		modalON();
		return data;
	};


	/* ==========================================================================
		cookie cart / cart_building
	========================================================================== */

	// buildCart
	if ($('body').hasClass('cart')) {
		buildCart();
	}

	//
	$(document).on('click', '.cart-list .remove', function() {
		let initial_cookie = Cookies.getJSON('cart') || [];
		var slug = $(this).closest('.item').attr('id');
		var new_cookie = updateJSON(initial_cookie, null, slug);
		Cookies.set('cart', JSON.stringify(new_cookie), { expires: 7 })
		removeCartItem(slug);
	});


	function buildCart() {
		let cookie = Cookies.getJSON('cart') || [];
		var cart_total = 0;

		$.each(cookie, function(index) {
			let slug = cookie[index].slug;
			let title = cookie[index].product;
			let brand = cookie[index].brand;
			let contribution = cookie[index].contribution;
			let price = Number(cookie[index].price);
			let availability;
			let pathProducts = "products/" + slug;

			// check availability
			return onValue(ref(db, pathProducts), (snapshot) => {
				if (snapshot.val() !== null && snapshot.val().amountLeft !== null) {
					let currentAmountLeft = snapshot.val().amountLeft;
					if (currentAmountLeft == 0) {
						availability = false;
					} else {
						availability = true;
						contribution = 'partial';
						price = currentAmountLeft;
					}
				} else {
					availability = true;
				}
				if (contribution == 'partial') {
					title += ' (participation)';
				}
				// push to HTML
				if (availability == true) {
					let elementLi = document.createElement("li");
					elementLi.classList.add('item');
					elementLi.setAttribute("id", slug)
					elementLi.innerHTML = '<ul><li class="title"><span><a href="/' + slug + '">' + title + '</a></span><span class="brand">' + brand + '</span></li><li class="price"><span class="amount">' + price.toFixed(2) + '</span><span> ' + currency + '</span></li><li class="remove">x</li></ul>';

					$("#cart-total").before(elementLi);
					cart_total += price;
					$('#cart-total .price .amount').text(cart_total.toFixed(2));
					$('.cart form .button').addClass('active');
				}
			}, {
				onlyOnce: true
			});
		});
	};

	function removeCartItem(slug) {
		var cart_total = $('#cart-total .price .amount').text();
		var removePrice = $('#' + slug + ' .price .amount').text();

		cart_total -= removePrice;
		$('#cart-total .price .amount').text(cart_total.toFixed(2));
		$('#' + slug).remove();

		if (cart_total == 0) {
			$('.cart-main').addClass('empty');
		}
	};
});