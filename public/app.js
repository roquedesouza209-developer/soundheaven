const supportModal = document.querySelector("#support-modal");
const supportBackdrop = document.querySelector("[data-backdrop]");
const supportForm = document.querySelector("[data-support-form]");
const feedback = document.querySelector("[data-form-feedback]");
const openButtons = document.querySelectorAll("[data-open-support]");
const closeButton = document.querySelector("[data-close-support]");
const submitButton = supportForm?.querySelector('button[type="submit"]');

function setFeedback(message, type = "") {
  if (!feedback) {
    return;
  }

  feedback.textContent = message;
  feedback.classList.remove("is-error", "is-success");

  if (type) {
    feedback.classList.add(type === "error" ? "is-error" : "is-success");
  }
}

function openSupportModal() {
  supportModal?.classList.remove("hidden");
  supportBackdrop?.classList.remove("hidden");
  document.body.style.overflow = "hidden";
  supportForm?.elements.email?.focus();
}

function closeSupportModal() {
  supportModal?.classList.add("hidden");
  supportBackdrop?.classList.add("hidden");
  document.body.style.overflow = "";
}

function validateForm(email, message) {
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!email.trim()) {
    return "Email is required.";
  }

  if (!emailPattern.test(email.trim())) {
    return "Please enter a valid email address.";
  }

  if (!message.trim()) {
    return "Message is required.";
  }

  if (message.trim().length < 10) {
    return "Message must be at least 10 characters long.";
  }

  return "";
}

openButtons.forEach((button) => {
  button.addEventListener("click", openSupportModal);
});

closeButton?.addEventListener("click", closeSupportModal);
supportBackdrop?.addEventListener("click", closeSupportModal);

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && supportModal && !supportModal.classList.contains("hidden")) {
    closeSupportModal();
  }
});

supportForm?.addEventListener("submit", async (event) => {
  event.preventDefault();

  const formData = new FormData(supportForm);
  const email = String(formData.get("email") || "");
  const message = String(formData.get("message") || "");
  const validationMessage = validateForm(email, message);

  if (validationMessage) {
    setFeedback(validationMessage, "error");
    return;
  }

  submitButton?.setAttribute("disabled", "true");
  submitButton?.setAttribute("aria-busy", "true");
  setFeedback("Sending your message...");

  try {
    const response = await fetch("/api/support", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, message }),
    });

    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.error || "Unable to send support request.");
    }

    supportForm.reset();
    setFeedback(payload.message || "Support request sent successfully.", "success");

    window.setTimeout(() => {
      closeSupportModal();
      setFeedback("");
    }, 1800);
  } catch (error) {
    const messageText = error instanceof Error ? error.message : "Something went wrong.";
    setFeedback(messageText, "error");
  } finally {
    submitButton?.removeAttribute("disabled");
    submitButton?.removeAttribute("aria-busy");
  }
});
