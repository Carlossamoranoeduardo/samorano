
const pages = {
  home: document.getElementById("homePage"),
  explore: document.getElementById("explorePage"),
  messages: document.getElementById("messagesPage"),
  profile: document.getElementById("profilePage"),
  publish: document.getElementById("publishPage")
};

const postFeed = document.getElementById("postFeed");
const photoInput = document.getElementById("photoInput");
const preview = document.getElementById("photoPreview");
const publishForm = document.getElementById("publishForm");
const publishMessage = document.getElementById("publishMessage");
const captionInput = document.getElementById("captionInput");
const submitButton = publishForm.querySelector('button[type="submit"]');

let previewUrl = null;
let currentUser = null;

function showPage(name) {
  if (!pages[name]) return;

  Object.entries(pages).forEach(([key, element]) => {
    element.classList.toggle("hidden", key !== name);
  });

  document.querySelectorAll("[data-page]").forEach(button => {
    button.classList.toggle("active", button.dataset.page === name);
  });

  window.scrollTo({ top: 0, behavior: "smooth" });
}

document.querySelectorAll("[data-page]").forEach(button => {
  button.addEventListener("click", () => showPage(button.dataset.page));
});

document.querySelectorAll("[data-go]").forEach(button => {
  button.addEventListener("click", () => showPage(button.dataset.go));
});

document.getElementById("headerProfile").addEventListener("click", () => {
  showPage("profile");
});

document.getElementById("logoutButton").addEventListener("click", async () => {
  try {
    await fetch("/api/auth/logout", {
      method: "POST",
      credentials: "same-origin"
    });
  } finally {
    window.location.href = "/";
  }
});

async function loadCurrentUser() {
  try {
    const response = await fetch("/api/auth/me", {
      credentials: "same-origin"
    });

    if (!response.ok) {
      window.location.replace("/");
      return false;
    }

    const data = await response.json();
    currentUser = data.user;

    document.getElementById("welcomeName").textContent = currentUser.name;
    document.getElementById("summaryName").textContent = currentUser.name;
    document.getElementById("summaryEmail").textContent = currentUser.email;
    document.getElementById("profileName").textContent = currentUser.name;
    document.getElementById("profileEmail").textContent = currentUser.email;

    const initial = currentUser.name.trim().charAt(0).toUpperCase() || "S";

    document.getElementById("summaryAvatar").textContent = initial;
    document.getElementById("profileAvatar").textContent = initial;
    document.getElementById("headerProfile").textContent = initial;

    return true;
  } catch {
    window.location.replace("/");
    return false;
  }
}

async function loadProfile() {
  const message = document.getElementById("profileMessage");

  try {
    const response = await fetch("/api/profiles/me", {
      credentials: "same-origin"
    });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Não foi possível carregar o perfil.");
    }

    const profile = data.profile;

    document.getElementById("usernameInput").value = profile.username || "";
    document.getElementById("bioInput").value = profile.bio || "";
    document.getElementById("profileUsername").textContent =
      profile.username ? "@" + profile.username : "Escolha seu nome de usuário";

    document.getElementById("profileBio").textContent =
      profile.bio || "Adicione uma biografia ao seu perfil.";

    const photo = document.getElementById("profilePhoto");
    const avatar = document.getElementById("profileAvatar");

    if (profile.avatar_url) {
      photo.src = profile.avatar_url;
      photo.classList.remove("hidden");
      avatar.classList.add("hidden");
    } else {
      photo.removeAttribute("src");
      photo.classList.add("hidden");
      avatar.classList.remove("hidden");
    }

    if (message) message.textContent = "";
  } catch (error) {
    if (message) message.textContent = error.message;
  }
}

document.getElementById("profileForm").addEventListener("submit", async event => {
  event.preventDefault();

  const form = event.currentTarget;
  const message = document.getElementById("profileMessage");
  const button = form.querySelector('button[type="submit"]');
  const username = document.getElementById("usernameInput").value.trim();
  const bio = document.getElementById("bioInput").value.trim();
  const avatarInput = document.getElementById("avatarInput");
  const file = avatarInput.files[0];

  if (!/^[a-zA-Z0-9_.]{3,30}$/.test(username)) {
    message.textContent =
      "Use de 3 a 30 caracteres: letras, números, ponto ou sublinhado.";
    return;
  }

  if (bio.length > 300) {
    message.textContent = "A biografia pode ter no máximo 300 caracteres.";
    return;
  }

  if (file && !["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    message.textContent = "Escolha uma imagem JPG, PNG ou WebP.";
    return;
  }

  if (file && file.size > 5 * 1024 * 1024) {
    message.textContent = "A foto deve ter no máximo 5 MB.";
    return;
  }

  button.disabled = true;
  message.textContent = "Salvando perfil...";

  try {
    const response = await fetch("/api/profiles/me", {
      method: "PUT",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, bio })
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || "Não foi possível salvar o perfil.");
    }

    if (file) {
      message.textContent = "Enviando foto de perfil...";

      const formData = new FormData();
      formData.append("avatar", file);

      const photoResponse = await fetch("/api/profiles/me/avatar", {
        method: "PUT",
        credentials: "same-origin",
        body: formData
      });

      const photoResult = await photoResponse.json();

      if (!photoResponse.ok) {
        throw new Error(
          "Os dados foram salvos, mas a foto não: " +
          (photoResult.error || "erro no envio.")
        );
      }

      avatarInput.value = "";
    }

    await loadProfile();
    message.textContent = "Perfil salvo com sucesso!";
  } catch (error) {
    message.textContent = error.message;
  } finally {
    button.disabled = false;
  }
});

function makeElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}


function makePostCard(post) {
  const card = makeElement("article", "post-card");
  card.dataset.postId = post.id;

  const header = makeElement("div", "post-header");
  const avatar = makeElement(
    "span",
    "avatar",
    (post.name || "S").trim().charAt(0).toUpperCase()
  );

  const identity = makeElement("div");
  identity.append(
    makeElement("strong", "", post.name || "Usuário"),
    makeElement("small", "", new Date(post.created_at).toLocaleString("pt-BR"))
  );
  header.append(avatar, identity);

  const image = makeElement("img", "post-image");
  image.src = post.image_url;
  image.alt = "Foto publicada no Samorano";
  image.loading = "lazy";

  const actions = makeElement("div", "post-actions");


  const likeButton = makeElement(
    "button",
    `like-button${post.liked_by_me ? " liked" : ""}`
  );
  likeButton.type = "button";
  likeButton.append(
    document.createTextNode(post.liked_by_me ? "♥ " : "♡ "),
    makeElement(
      "span",
      "",
      `${post.liked_by_me ? "Curtido" : "Curtir"} (${post.likes_count || 0})`
    )
  );


  likeButton.addEventListener("click", async () => {
    likeButton.disabled = true;

    try {
      const response = await fetch(`/api/posts/${post.id}/like`, {
        method: "POST",
        credentials: "same-origin"
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Falha na curtida.");
      }

      await loadPosts();
    } catch (error) {
      alert(error.message);
    } finally {
      likeButton.disabled = false;
    }
  });

  const commentButton = makeElement(
    "button",
    "comment-button",
    "▢ Comentar"
  );
  commentButton.type = "button";

  const shareButton = makeElement(
    "button",
    "share-button",
    "↗ Compartilhar"
  );
  shareButton.type = "button";

  shareButton.addEventListener("click", async () => {
    try {
      if (navigator.share) {
        await navigator.share({
          title: "Samorano",
          text: post.caption || "Confira esta foto no Samorano.",
          url: window.location.href
        });
      } else {
        await navigator.clipboard.writeText(window.location.href);
        alert("Link copiado!");
      }
    } catch (error) {
      if (error.name !== "AbortError") {
        alert("Não foi possível compartilhar agora.");
      }
    }
  });

  actions.append(likeButton, commentButton, shareButton);

  const caption = makeElement("div", "post-caption");
  caption.append(
    makeElement("strong", "", post.name || "Usuário"),
    document.createTextNode(" " + (post.caption || ""))
  );

  const commentsSection = makeElement("section", "comments-section");
  const commentsTitle = makeElement("h3", "comments-title", "Comentários");
  const commentsList = makeElement("div", "comments-list");

  const commentForm = makeElement("form", "inline-comment-form");
  const commentInput = makeElement("input", "inline-comment-input");
  commentInput.type = "text";
  commentInput.placeholder = "Escreva um comentário...";
  commentInput.maxLength = 1000;
  commentInput.setAttribute("aria-label", "Escreva um comentário");
  commentInput.required = true;

  const sendComment = makeElement("button", "comment-send-button", "Enviar");
  sendComment.type = "submit";

  commentForm.append(commentInput, sendComment);
  commentsSection.append(commentsTitle, commentsList, commentForm);

  async function loadComments() {
    commentsList.replaceChildren(
      makeElement("p", "muted", "Carregando comentários...")
    );

    try {
      const response = await fetch(
        `/api/posts/${post.id}/comments`,
        { credentials: "same-origin" }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Não foi possível carregar comentários.");
      }

      commentsList.replaceChildren();

      if (!data.comments.length) {
        commentsList.append(
          makeElement("p", "muted", "Seja o primeiro a comentar.")
        );
        return;
      }

      data.comments.forEach(comment => {
        const item = makeElement("article", "comment-item");
        const author = makeElement(
          "strong",
          "comment-author",
          comment.name || "Usuário"
        );
        const text = makeElement(
          "p",
          "comment-text",
          comment.content
        );
        const date = makeElement(
          "small",
          "comment-date",
          new Date(comment.created_at).toLocaleString("pt-BR")
        );

        item.append(author, text, date);
        commentsList.append(item);
      });
    } catch (error) {
      commentsList.replaceChildren(
        makeElement("p", "muted", error.message)
      );
    }
  }

  commentButton.addEventListener("click", () => {
    commentsSection.classList.toggle("comments-collapsed");

    if (!commentsSection.classList.contains("comments-collapsed")) {
      loadComments();
      commentInput.focus();
    }
  });

  commentForm.addEventListener("submit", async event => {
    event.preventDefault();

    const content = commentInput.value.trim();

    if (!content) return;

    sendComment.disabled = true;

    try {
      const response = await fetch(
        `/api/posts/${post.id}/comments`,
        {
          method: "POST",
          credentials: "same-origin",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ content })
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Não foi possível comentar.");
      }

      commentInput.value = "";
      await loadComments();
    } catch (error) {
      alert(error.message);
    } finally {
      sendComment.disabled = false;
    }
  });

  commentsSection.classList.add("comments-collapsed");

  card.append(header, image, actions, caption, commentsSection);

  return card;
}


async function loadPosts() {
  try {
    const response = await fetch("/api/posts", {
      credentials: "same-origin"
    });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Não foi possível carregar o feed.");
    }

    postFeed.replaceChildren();

    if (!data.posts.length) {
      postFeed.append(
        makeElement("p", "muted", "Ainda não há publicações reais. Compartilhe a primeira foto!")
      );
      return;
    }

    data.posts.forEach(post => postFeed.append(makePostCard(post)));
  } catch (error) {
    console.error(error);
    postFeed.replaceChildren(
      makeElement("p", "muted", "Não foi possível carregar as publicações. Atualize a página e tente novamente.")
    );
  }
}

photoInput.addEventListener("change", () => {
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = null;

  const file = photoInput.files[0];

  if (!file) {
    preview.classList.add("hidden");
    preview.removeAttribute("src");
    return;
  }

  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    photoInput.value = "";
    preview.classList.add("hidden");
    publishMessage.textContent = "Escolha uma imagem JPG, PNG ou WebP.";
    return;
  }

  if (file.size > 8 * 1024 * 1024) {
    photoInput.value = "";
    preview.classList.add("hidden");
    publishMessage.textContent = "A imagem deve ter no máximo 8 MB.";
    return;
  }

  previewUrl = URL.createObjectURL(file);
  preview.src = previewUrl;
  preview.classList.remove("hidden");
  publishMessage.textContent = "Prévia pronta. Sua foto será enviada ao publicar.";
});

publishForm.addEventListener("submit", async event => {
  event.preventDefault();

  const file = photoInput.files[0];

  if (!file) {
    publishMessage.textContent = "Escolha uma foto primeiro.";
    return;
  }

  submitButton.disabled = true;
  publishMessage.textContent = "Enviando foto e salvando publicação...";

  const formData = new FormData();
  formData.append("photo", file);
  formData.append("caption", captionInput.value.trim());

  try {
    const response = await fetch("/api/posts", {
      method: "POST",
      credentials: "same-origin",
      body: formData
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || "Não foi possível publicar.");
    }

    publishMessage.textContent = "Foto publicada com sucesso!";
    publishForm.reset();

    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = null;
    preview.removeAttribute("src");
    preview.classList.add("hidden");

    await loadPosts();
    showPage("home");
  } catch (error) {
    publishMessage.textContent = error.message;
  } finally {
    submitButton.disabled = false;
  }
});

document.querySelectorAll(".like-button").forEach(button => {
  if (button.closest("[data-post-id]")) return;

  button.addEventListener("click", () => {
    const liked = button.classList.toggle("liked");
    button.firstChild.textContent = liked ? "♥ " : "♡ ";
    button.querySelector("span").textContent = liked ? "Curtido" : "Curtir";
  });
});

document.querySelectorAll(".comment-button").forEach(button => {
  button.addEventListener("click", () => {
    alert("Os comentários serão conectados na próxima etapa.");
  });
});

document.querySelectorAll(".share-button").forEach(button => {
  button.addEventListener("click", async () => {
    try {
      if (navigator.share) {
        await navigator.share({
          title: "Samorano",
          text: "Confira esta publicação no Samorano.",
          url: window.location.href
        });
      } else {
        await navigator.clipboard.writeText(window.location.href);
        alert("Link copiado!");
      }
    } catch (error) {
      if (error.name !== "AbortError") {
        alert("Não foi possível compartilhar agora.");
      }
    }
  });
});

document.getElementById("searchInput").addEventListener("input", event => {
  const query = event.target.value.trim().toLowerCase();

  showPage("home");

  document.querySelectorAll(".post-card").forEach(card => {
    card.classList.toggle(
      "hidden",
      !card.textContent.toLowerCase().includes(query)
    );
  });
});



(async function initializeFeed() {
  const authenticated = await loadCurrentUser();

  if (authenticated) {
    await loadProfile();
    await loadPosts();
    await loadMyProfilePosts();
  }
})();


async function loadMyProfilePosts() {
  const grid = document.getElementById("profilePostGrid");
  const message = document.getElementById("profilePostsMessage");

  if (!grid || !message) return;

  grid.replaceChildren();
  message.textContent = "Carregando suas publicações...";

  try {
    const response = await fetch("/api/posts", {
      credentials: "same-origin"
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Não foi possível carregar as fotos.");
    }

    // O servidor precisa informar o usuário dono de cada publicação.
    const myPosts = (data.posts || []).filter(post =>
      String(post.user_id) === String(currentUser?.id)
    );

    if (myPosts.length === 0) {
      message.textContent = "Você ainda não tem publicações.";
      return;
    }

    myPosts.forEach(post => {
      const item = document.createElement("div");
      item.className = "profile-post-item";

      const image = document.createElement("img");
      image.src = post.image_url;
      image.alt = post.caption || "Minha publicação";
      image.loading = "lazy";

      item.appendChild(image);
      grid.appendChild(item);
    });

    message.textContent = "";
  } catch (error) {
    console.error("Erro ao carregar publicações do perfil:", error);
    message.textContent = "Não foi possível carregar suas publicações.";
  }
}
