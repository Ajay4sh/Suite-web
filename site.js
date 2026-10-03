/* Avyntro — shared site behavior: mobile nav + db-backed forms. */
(function () {
  "use strict";

  function onReady(fn) {
    if (document.readyState !== "loading") fn();
    else document.addEventListener("DOMContentLoaded", fn);
  }

  /* ---------- Mobile nav toggle ---------- */
  function wireNav() {
    var toggle = document.querySelector(".nav-toggle");
    var mobile = document.querySelector(".nav-mobile");
    if (!toggle || !mobile) return;
    toggle.addEventListener("click", function () {
      var isOpen = mobile.classList.toggle("is-open");
      toggle.setAttribute("aria-expanded", isOpen ? "true" : "false");
    });
  }

  /* ---------- db capability (lazy, memoized) ---------- */
  var dbPromise = null;
  function getDb() {
    if (!window.claude || typeof window.claude.use !== "function") {
      return Promise.resolve(null);
    }
    if (!dbPromise) dbPromise = window.claude.use("db");
    return dbPromise;
  }

  function setStatus(el, kind, text) {
    if (!el) return;
    el.className = "form-status " + kind;
    el.textContent = text;
  }

  function fieldValue(form, name) {
    var el = form.elements.namedItem(name);
    if (!el) return "";
    if (el instanceof RadioNodeList) {
      for (var i = 0; i < el.length; i++) {
        if (el[i].checked) return el[i].value;
      }
      return "";
    }
    return (el.value || "").trim();
  }

  function checkedValues(form, name) {
    var nodes = form.querySelectorAll('input[name="' + name + '"]:checked');
    var out = [];
    nodes.forEach(function (n) { out.push(n.value); });
    return out;
  }

  /* ---------- Generic db-backed form wiring ---------- */
  // opts: { formId, statusId, collection, buildDoc(form), successText }
  function wireDbForm(opts) {
    var form = document.getElementById(opts.formId);
    if (!form) return;
    var status = document.getElementById(opts.statusId);
    var submitBtn = form.querySelector('button[type="submit"]');

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (!form.checkValidity()) {
        form.reportValidity();
        return;
      }
      var doc = opts.buildDoc(form);
      doc.submittedAt = new Date().toISOString();

      if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = "Sending…"; }
      setStatus(status, "", "");

      getDb().then(function (db) {
        if (!db) {
          setStatus(
            status,
            "err",
            "Submissions aren't connected yet on this site — please email info@avyntro.com directly and we'll get back to you."
          );
          if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = opts.submitLabel || "Submit"; }
          return;
        }
        return db.collection(opts.collection).add(doc).then(function () {
          form.reset();
          setStatus(status, "ok", opts.successText);
          if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = opts.submitLabel || "Submit"; }
        });
      }).catch(function (err) {
        var msg = "Something went wrong submitting this — please try again in a moment, or email info@avyntro.com directly.";
        setStatus(status, "err", msg);
        if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = opts.submitLabel || "Submit"; }
      });
    });
  }

  function initForms() {
    wireDbForm({
      formId: "request-access-form",
      statusId: "request-access-status",
      collection: "leads",
      submitLabel: "Request Early Access",
      successText: "Thanks — your request is in. We'll reach out at the email you gave us as early access opens up.",
      buildDoc: function (form) {
        return {
          name: fieldValue(form, "name"),
          email: fieldValue(form, "email"),
          company: fieldValue(form, "company"),
          teamSize: fieldValue(form, "teamSize"),
          modules: checkedValues(form, "modules"),
          message: fieldValue(form, "message")
        };
      }
    });

    wireDbForm({
      formId: "contact-form",
      statusId: "contact-status",
      collection: "contact_messages",
      submitLabel: "Send Message",
      successText: "Thanks — your message is in. We'll get back to you at the email you gave us.",
      buildDoc: function (form) {
        return {
          name: fieldValue(form, "name"),
          email: fieldValue(form, "email"),
          topic: fieldValue(form, "topic"),
          message: fieldValue(form, "message")
        };
      }
    });

    wireDbForm({
      formId: "notify-form",
      statusId: "notify-status",
      collection: "launch_notify",
      submitLabel: "Notify Me",
      successText: "You're on the list — we'll email you when this module is ready.",
      buildDoc: function (form) {
        return {
          email: fieldValue(form, "email"),
          modules: checkedValues(form, "modules")
        };
      }
    });
  }

  onReady(function () {
    wireNav();
    initForms();
  });
})();
