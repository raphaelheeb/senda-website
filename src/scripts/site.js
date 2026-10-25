// SENDA site behaviour: mobile menu, newsletter forms, product state preview, configurator.
(function () {
  "use strict";

  // Mobile menu
  var menuBtn = document.querySelector(".menu-btn");
  var drawer = document.getElementById("drawer");
  if (menuBtn && drawer) {
    menuBtn.addEventListener("click", function () {
      var open = drawer.getAttribute("data-open") !== "true";
      drawer.setAttribute("data-open", String(open));
      menuBtn.setAttribute("aria-expanded", String(open));
      document.body.style.overflow = open ? "hidden" : "";
    });
    drawer.addEventListener("click", function (e) {
      if (e.target.closest("a")) {
        drawer.setAttribute("data-open", "false");
        menuBtn.setAttribute("aria-expanded", "false");
        document.body.style.overflow = "";
      }
    });
  }

  // Newsletter and notify-me forms (MailerLite through /api/subscribe)
  document.querySelectorAll(".js-signup").forEach(function (form) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var email = form.querySelector('[name="email"]');
      var consent = form.querySelector('[name="consent"]');
      var msg = form.querySelector(".form-msg");
      var btn = form.querySelector('[type="submit"]');
      if (!email.value || email.value.indexOf("@") < 1) {
        msg.textContent = "Enter a valid email address.";
        email.focus();
        return;
      }
      if (consent && !consent.checked) {
        msg.textContent = "Tick the box to agree to receive emails.";
        consent.focus();
        return;
      }
      btn.disabled = true;
      msg.textContent = "Sending…";
      fetch(window.SENDA.subscribeUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.value.trim(), name: "", list: form.getAttribute("data-list") || "senda" })
      })
        .then(function (r) {
          if (!r.ok) throw new Error();
          msg.textContent = "You're on the list. We'll write when there is news.";
          form.reset();
        })
        .catch(function () {
          msg.textContent = "That didn't go through. Try again, or write to info@sendabikes.com.";
        })
        .finally(function () { btn.disabled = false; });
    });
  });

  // Product state preview (proposal only): announced / pre-order / available
  var product = document.querySelector("[data-product]");
  var stateButtons = document.querySelectorAll("[data-set-state]");
  function setState(state) {
    if (!product) return;
    product.setAttribute("data-state", state);
    stateButtons.forEach(function (b) {
      b.setAttribute("aria-pressed", String(b.getAttribute("data-set-state") === state));
    });
    document.querySelectorAll(".js-status-badge").forEach(function (badge) {
      badge.className = "badge js-status-badge badge--" + state;
      badge.textContent = { announced: "Announced", preorder: "Pre-order", available: "Available" }[state];
    });
  }
  if (product && stateButtons.length) {
    var fromUrl = new URLSearchParams(location.search).get("state");
    setState(fromUrl || product.getAttribute("data-state"));
    stateButtons.forEach(function (b) {
      b.addEventListener("click", function () {
        var s = b.getAttribute("data-set-state");
        setState(s);
        var url = new URL(location.href);
        url.searchParams.set("state", s);
        history.replaceState(null, "", url);
      });
    });
  }

  // Configurator
  var config = document.querySelector("[data-configurator]");
  if (config) {
    var chf = function (n) { return "CHF " + n.toLocaleString("en-US"); };
    var update = function () {
      var get = function (name) { return config.querySelector('[name="' + name + '"]:checked'); };
      var platform = get("platform"), finish = get("finish"), kit = get("kit"), wheels = get("wheels");
      var total = 0;
      [platform, kit, wheels].forEach(function (el) { if (el) total += Number(el.getAttribute("data-price") || 0); });
      var set = function (key, text) {
        var el = config.querySelector('[data-out="' + key + '"]');
        if (el) el.textContent = text;
      };
      set("platform", platform ? platform.value : "");
      set("finish", finish ? finish.value : "");
      set("kit", kit ? kit.value : "");
      set("wheels", wheels ? wheels.value : "");
      set("total", chf(total));
      var size = config.querySelector('[name="height"]').value;
      set("size", size ? suggestSize(Number(size)) : "Book a fitting or enter your height");
      var img = config.querySelector("[data-out-img]");
      if (img && platform) img.src = platform.getAttribute("data-img");
      var swatch = config.querySelector("[data-out-swatch]");
      if (swatch && finish) swatch.style.background = finish.getAttribute("data-hex");
    };
    // Placeholder size chart until geometry is final
    var suggestSize = function (cm) {
      if (!cm || cm < 140 || cm > 210) return "Enter a height between 140 and 210 cm";
      if (cm < 163) return "XS (indicative)";
      if (cm < 172) return "S (indicative)";
      if (cm < 180) return "M (indicative)";
      if (cm < 188) return "L (indicative)";
      return "XL (indicative)";
    };
    var pre = new URLSearchParams(location.search).get("platform");
    if (pre === "gravel" || pre === "road") {
      var target = config.querySelector('[name="platform"][value="SENDA ' + (pre === "gravel" ? "Gravel" : "Road") + '"]');
      if (target) target.checked = true;
    }
    config.addEventListener("change", update);
    config.addEventListener("input", update);
    update();
  }
})();
