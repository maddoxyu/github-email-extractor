import { type PlasmoCSConfig } from "plasmo"
import { useState, useEffect } from "react"

export const config: PlasmoCSConfig = {
  matches: ["https://github.com/*"]
}

const GitHubEmailExtractor = () => {
  const [emails, setEmails] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState(null)
  const [progress, setProgress] = useState("")

  useEffect(() => {
    const extractEmails = async () => {
      setIsLoading(true)
      setError(null)
      setEmails([]) 

      try {
        let extractedEmails = await processCurrentPage()
        setEmails([...new Set(extractedEmails)])
      } catch (err) {
        setError(`Failed to extract emails: ${err.message}`)
      } finally {
        setIsLoading(false)
        setProgress("")
      }
    }

    const messageListener = (message, sender, sendResponse) => {
      if (message.action === "pageChanged") {
        extractEmails()
      }
    }

    chrome.runtime.onMessage.addListener(messageListener)

    extractEmails()

    return () => {
      chrome.runtime.onMessage.removeListener(messageListener)
    }
  }, [])

  const processCurrentPage = async () => {
    const pathParts = window.location.pathname.split('/').filter(Boolean)
    
    if (pathParts.length === 0) { //main pg
      return []
    } else if (pathParts.length === 1) { //pfp pg
      return await handleUserProfile()
    } else if (pathParts.length === 2) { //repo pg
      return await handleRepoPage()
    } else if (pathParts.includes('commit')) { //commit pg
      return await handleCommitPage()
    } else if (pathParts.includes('commits')) { //commits pg
      return await handleCommitsPage()
    } else if (window.location.href.endsWith('.patch')) { //patch pg
      return await handlePatchPage()
    }
    
    return []
  }

  const handleUserProfile = async () => {
    setProgress("Scanning repositories...")
    const repos = findRepos(document)
    const repo = repos[Math.floor(Math.random() * repos.length)]
    if (!repo) throw new Error('No repositories found')
    return processCommitPages(`${repo}/commits`)
  }

  const handleRepoPage = async () => {
    setProgress("Analyzing repository...")
    return processCommitPages(`${window.location.href}/commits`)
  }

  const handleCommitPage = async () => {
    return extractEmailsFromPatch(`${window.location.href}.patch`)
  }

  const handleCommitsPage = async () => {
    return processCommitPages(window.location.href)
  }

  const handlePatchPage = async () => {
    return extractEmailsFromPatch(window.location.href)
  }

  const processCommitPages = async (startUrl) => {
    let emails = []
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

  const extractEmailsFromCommitPage = async (url) => {
    const response = await fetch(url)
    const html = await response.text()
    const doc = new DOMParser().parseFromString(html, 'text/html')
    
    const commitLinks = [...doc.querySelectorAll('a')]
      .filter(a => a.href.match(/\/commit\/[a-f0-9]{40}/))
      .map(a => `${new URL(a.href).href}.patch`)
    
    const emails = (await Promise.all(commitLinks.map(extractEmailsFromPatch))).flat()
    const nextLink = doc.querySelector('.pagination a[rel="next"]') as HTMLAnchorElement | null
    
    return { foundEmails: emails, nextPage: nextLink?.href }
  }

  const extractEmailsFromPatch = async (url) => {
    try {
      const response = await fetch(url)
      const text = await response.text()
      const emailRegex = /\S+@\S+\.\S+/g
      const matches = text.match(emailRegex) || []
      
      const filteredEmails = matches.filter(email => {
        const [localPart, domain] = email.split('@')
        const isValidDomain = domain && domain.includes('.') && !/\d/.test(domain.split('.').pop() || '')
        const isNotPackageVersion = !/^[\w.-]+@\d+\.\d+\.\d+(-\w+(\.\d+)?)?$/.test(email)
        const isNotDevPattern = !/^(core|helpers|lodash|postcss|react(-dom)?|compiler-\w+|prettier|remapping|code-frame|compat-data)@/.test(email)
        return isValidDomain && isNotPackageVersion && isNotDevPattern
      }).map(email => {
        if (email.endsWith('@users.noreply.github.com')) {
          return email.replace(/^\d+\+/, '')
        }
        return email
      })
      
      return [...new Set(filteredEmails)]
    } catch (err) {
      console.error(`Failed to fetch ${url}:`, err)
      return []
    }
  }

  const findRepos = (doc) => {
    const repoSelectors = [
      'a[itemprop="name codeRepository"]',
      'a[data-hovercard-type="repository"]',
      'a.text-bold[href^="/"]'
    ]
    return [...doc.querySelectorAll(repoSelectors.join(','))]
      .map(a => a.href)
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
