/** Dépôt GitHub « utilisateur/repo » : les boutons de téléchargement pointent
 *  vers ses Releases, et les liens directs par plateforme sont résolus via
 *  l'API GitHub dès qu'une release existe. */
export const GITHUB_REPO = "lix033/dbdump";

export const REPO_URL = `https://github.com/${GITHUB_REPO}`;

export const RELEASES_PAGE = `${REPO_URL}/releases/latest`;

/** Domaine public de la landing : sert de base aux URL canoniques et aux
 *  alternates `hreflang`. */
export const SITE_URL = "https://dbdump.nameksociety.com";
