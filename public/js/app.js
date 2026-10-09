
const dialog = document.getElementById("accountDialog");
const title = document.getElementById("dialogTitle");
const description = document.getElementById("dialogDescription");
const form = document.getElementById("accountForm");
const nameInput = document.getElementById("name");
const passwordInput = document.getElementById("password");
const message = document.getElementById("formMessage");
const submitButton = document.getElementById("submitAccount");

let mode = "register";

function openAccountDialog(nextMode) {
  mode = nextMode;
  form.reset();
  message.textContent = "";

  const registering = mode === "register";

  title.textContent = registering
    ? "Crie sua conta"
    : "Entre no Samorano";

  description.textContent = registering
    ? "Crie seu espaço para compartilhar fotos e conversar."
    : "Entre para continuar suas conversas.";

  nameInput.required = registering;
  nameInput.hidden = !registering;
  nameInput.previousElementSibling.hidden = !registering;

  passwordInput.autocomplete = registering
    ? "new-password"
    : "current-password";

  submitButton.textContent = registering
    ? "Criar minha conta"
    : "Entrar";

  dialog.showModal();
}

document.getElementById("createAccount").addEventListener("click", () => {
  openAccountDialog("register");
});

document.getElementById("login").addEventListener("click", () => {
  openAccountDialog("login");
});

document.getElementById("closeDialog").addEventListener("click", () => {
  dialog.close();
});

dialog.addEventListener("click", (event) => {
  if (event.target === dialog) {
    dialog.close();
  }
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  message.textContent = "Conectando ao servidor...";
  submitButton.disabled = true;

  const payload = {
    email: document.getElementById("email").value.trim(),
    password: passwordInput.value
  };

  if (mode === "register") {
    payload.name = nameInput.value.trim();
  }

  try {
    const response = await fetch(
      mode === "register"
        ? "/api/auth/register"
        : "/api/auth/login",
      {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      }
    );

    const result = await response.json();

    if (!response.ok) {
      throw new Error(
        result.error || "Não foi possível continuar."
      );
    }

    message.textContent =
      result.message || "Operação concluída.";

    window.location.href = "/feed.html";
  } catch (error) {
    message.textContent =
      error.message === "Failed to fetch"
        ? "Não foi possível conectar ao servidor. Tente novamente."
        : error.message;
  } finally {
    submitButton.disabled = false;
  }
});
