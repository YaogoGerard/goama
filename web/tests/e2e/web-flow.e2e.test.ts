import { expect, test, type Page } from '@playwright/test'

const groups = [
  {
    id: 'group-1',
    epoch: 2,
    monRole: 'PARRAIN',
    membres: [{ agentId: 'agent-1', role: 'PARRAIN' }]
  }
]

const agents = [
  {
    id: 'agent-2',
    prenom: 'Awa',
    nom: 'Sawadogo',
    ministere: 'Santé',
    fonction: 'Médecin-conseil'
  }
]

async function mockApi(page: Page) {
  // Le runtime libolm réel est chargé par l'application ; ce test ne prétend
  // pas simuler ni valider la distribution Olm/Megolm entre agents.
  await page.route('http://localhost:8080/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const json = (body: unknown, status = 200) =>
      route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify(body)
      })

    if (url.pathname === '/account/me' && request.method() === 'GET') {
      return json({ id: 'agent-1', matricule: 'AG001', prenom: 'Jean', nom: 'Test', role: 'AGENT', statut: 'ACTIF' })
    }
    if (url.pathname === '/auth/connexion' && request.method() === 'POST') {
      return json({ jeton: 'test-token', sessionId: 'session-1' })
    }
    if (url.pathname === '/auth/deconnexion' && request.method() === 'POST') {
      return json({ ok: true })
    }
    if (url.pathname === '/groupes' && request.method() === 'GET') {
      return json(groups)
    }
    if (url.pathname === '/agents' && request.method() === 'GET') {
      return json(agents)
    }
    if (url.pathname === '/groupes/group-1/messages' && request.method() === 'GET') {
      return json([])
    }
    if (url.pathname === '/groupes/group-1/messages' && request.method() === 'POST') {
      return json({ seq: 1, epoch: 2, createdAt: new Date().toISOString() }, 201)
    }
    return json({ erreur: 'route_non_mockee' }, 404)
  })
}

test('refuse l’accès à la messagerie sans session', async ({ page }) => {
  await page.goto('/chat')
  await expect(page).toHaveURL('/')
  await expect(page.getByRole('heading', { name: 'Bienvenue sur Goama' })).toBeVisible()
})

test('connecte un agent et charge groupes et annuaire depuis l’API', async ({ page }) => {
  await mockApi(page)
  await page.goto('/')
  await page.getByLabel('Matricule').fill('AG001')
  await page.getByLabel('Mot de passe').fill('mot-de-passe-test')
  await page.getByLabel('Code de vérification').fill('123456')
  await page.getByRole('button', { name: 'Se connecter' }).click()

  await expect(page).toHaveURL('/chat')
  await expect(page.getByRole('heading', { name: 'Groupe' })).toBeVisible()

  await page.getByRole('button', { name: 'Annuaire officiel' }).click()
  await expect(page.getByText('Awa Sawadogo')).toBeVisible()
  await expect(page.getByText('Médecin-conseil')).toBeVisible()
})

test('vérifie que le client ne publie pas de texte en clair', async ({ page }) => {
  await mockApi(page)
  let sentPayload: { content?: string } | undefined
  page.on('request', (request) => {
    if (request.url() === 'http://localhost:8080/groupes/group-1/messages' && request.method() === 'POST') {
      sentPayload = request.postDataJSON() as { content?: string }
    }
  })

  await page.goto('/')
  await page.getByLabel('Matricule').fill('AG001')
  await page.getByLabel('Mot de passe').fill('mot-de-passe-test')
  await page.getByLabel('Code de vérification').fill('123456')
  await page.getByRole('button', { name: 'Se connecter' }).click()
  await expect(page.getByRole('heading', { name: 'Groupe' })).toBeVisible()
  await page.getByPlaceholder('Message chiffré').fill('message confidentiel')
  // Bouton d'envoi désactivé sans session Megolm valide (Megolm indisponible en mock)
  await expect(page.getByRole('button', { name: 'Envoyer le message' })).toBeDisabled()

  // Aucun secret n'est envoyé tant qu'une session Megolm valide n'a pas été
  // créée et distribuée par Olm aux appareils membres.
  await expect.poll(() => sentPayload).toBeUndefined()
  await expect(page.getByRole('main').getByText('message confidentiel')).toHaveCount(0)
})

test('déconnecte et retire le jeton local', async ({ page }) => {
  await mockApi(page)
  await page.goto('/')
  await page.getByLabel('Matricule').fill('AG001')
  await page.getByLabel('Mot de passe').fill('mot-de-passe-test')
  await page.getByLabel('Code de vérification').fill('123456')
  await page.getByRole('button', { name: 'Se connecter' }).click()
  await page.getByTitle('Déconnexion').click()

  await expect(page).toHaveURL('/')
  await expect(page).toHaveTitle(/Goama/i)
  await expect(page.evaluate(() => localStorage.getItem('goama_token'))).resolves.toBeNull()
})
