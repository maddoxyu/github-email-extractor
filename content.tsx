import { type PlasmoCSConfig } from "plasmo"
import { useState, useEffect, useCallback } from "react"

export const config: PlasmoCSConfig = {
  matches: ["https://github.com/*"]
}

const GitHubEmailExtractor = () => {
  const [emails, setEmails] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState("")

  const extractEmails = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    setEmails([])

    try {
      const extractedEmails = await processCurrentPage()
      setEmails([...new Set(extractedEmails)])
    } catch (err) {
      setError(`Failed to extract emails: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setIsLoading(false)
      setProgress("")
    }
  }, [])

  useEffect(() => {
    const messageListener = (message: { action: string }) => {
      if (message.action === "pageChanged") {
        extractEmails()
      }
    }

    chrome.runtime.onMessage.addListener(messageListener)
    extractEmails()

    return () => {
      chrome.runtime.onMessage.removeListener(messageListener)
    }
  }, [extractEmails])

  const processCurrentPage = async (): Promise<string[]> => {
    const pathParts = window.location.pathname.split('/').filter(Boolean)
    
    switch (true) {
      case pathParts.length === 0:
        return [] // main page
      case pathParts.length === 1:
        return handleUserProfile() // profile page
      case pathParts.length === 2:
        return handleRepoPage() // repository page
      case pathParts.includes('commit'):
        return handleCommitPage() // commit page
      case pathParts.includes('commits'):
        return handleCommitsPage() // commits page
      case window.location.href.endsWith('.patch'):
        return handlePatchPage() // patch page
      default:
        return []
    }
  }

  const handleUserProfile = async (): Promise<string[]> => {
    setProgress("Scanning repositories...")
    const repos = findRepos(document)
    const repo = repos[Math.floor(Math.random() * repos.length)]
    if (!repo) throw new Error('No repositories found')
    return processCommitPages(`${repo}/commits`)
  }

  const handleRepoPage = async (): Promise<string[]> => {
    setProgress("Analyzing repository...")
    return processCommitPages(`${window.location.href}/commits`)
  }

  const handleCommitPage = async (): Promise<string[]> => {
    return extractEmailsFromPatch(`${window.location.href}.patch`)
  }

  const handleCommitsPage = async (): Promise<string[]> => {
    return processCommitPages(window.location.href)
  }

  const handlePatchPage = async (): Promise<string[]> => {
    return extractEmailsFromPatch(window.location.href)
  }

  const processCommitPages = async (startUrl: string): Promise<string[]> => {
    let emails: string[] = []
    let currentPage = startUrl
    for (let i = 0; i < 3 && currentPage; i++) {
      setProgress(`Processing page ${i + 1}`)
      const { foundEmails, nextPage } = await extractEmailsFromCommitPage(currentPage)
      emails.push(...foundEmails)
      currentPage = nextPage
      await new Promise(r => setTimeout(r, 1000))
    }
    return emails
  }

  const extractEmailsFromCommitPage = async (url: string): Promise<{ foundEmails: string[], nextPage: string | null }> => {
    const response = await fetch(url)
    const html = await response.text()
    const doc = new DOMParser().parseFromString(html, 'text/html')
    
    const commitLinks = Array.from(doc.querySelectorAll('a'))
      .filter(a => a.href.match(/\/commit\/[a-f0-9]{40}/))
      .map(a => `${new URL(a.href).href}.patch`)
    
    const emails = (await Promise.all(commitLinks.map(extractEmailsFromPatch))).flat()
    const nextLink = doc.querySelector('.pagination a[rel="next"]') as HTMLAnchorElement | null
    
    return { foundEmails: emails, nextPage: nextLink?.href || null }
  }

  const extractEmailsFromPatch = async (url: string): Promise<string[]> => {
    try {
      const response = await fetch(url)
      const text = await response.text()
      const emailRegex = /\S+@\S+\.\S+/g
      const matches = text.match(emailRegex) || []
      
      return [...new Set(matches
        .filter(email => {
          const [localPart, domain] = email.split('@')
          const isValidDomain = domain && domain.includes('.') && !/\d/.test(domain.split('.').pop() || '')
          const isNotPackageVersion = !/^[\w.-]+@\d+\.\d+\.\d+(-\w+(\.\d+)?)?$/.test(email)
          const isNotDevPattern = !/^(core|helpers|lodash|postcss|react(-dom)?|compiler-\w+|prettier|remapping|code-frame|compat-data)@/.test(email)
          return isValidDomain && isNotPackageVersion && isNotDevPattern
        })
        .map(email => email.endsWith('@users.noreply.github.com') ? email.replace(/^\d+\+/, '') : email)
      )]
    } catch (err) {
      console.error(`Failed to fetch ${url}:`, err)
      return []
    }
  }

  const findRepos = (doc: Document): string[] => {
    const repoSelectors = [
      'a[itemprop="name codeRepository"]',
      'a[data-hovercard-type="repository"]',
      'a.text-bold[href^="/"]'
    ]
    return Array.from(doc.querySelectorAll(repoSelectors.join(',')))
      .map(a => (a as HTMLAnchorElement).href)
      .filter(href => href.split('/').length === 5)
  }

  return (
    <div style={{
      position: 'fixed',
      top: '10px',
      right: '10px',
      backgroundColor: 'white',
      color: 'black',
      padding: '10px',
      border: '1px solid #ccc',
      borderRadius: '5px',
      boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
      zIndex: 9999,
      maxWidth: '300px',
      maxHeight: '400px',
      overflow: 'auto'
    }}>
      <h3>Emails Found: {emails.length}</h3>
      {isLoading ? (
        <div>
          <p>Extracting emails... Please wait.</p>
          <p>{progress}</p>
        </div>
      ) : error ? (
        <p style={{ color: 'red' }}>{error}</p>
      ) : (
        <ul>
          {emails.map((email, i) => <li key={i}>{email}</li>)}
        </ul>
      )}
    </div>
  )
}

export default function PlasmoOverlay() {
  return <GitHubEmailExtractor />
}
