import { type PlasmoCSConfig } from "plasmo"
import { useState, useEffect } from "react"

//takes all possible github urls
export const config: PlasmoCSConfig = {
  matches: [
    "https://github.com/*",
    "https://github.com/*/*",
    "https://github.com/*/*/commit/*",
    "https://github.com/*/*/commits/*",
    "https://github.com/*/*/commit/*.patch"
  ]
}

const GitHubEmailExtractor = () => {
  //state consts
  const [emails, setEmails] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState<string>("")

  useEffect(() => {
    const extractEmailsFromPatch = async (patchUrl: string): Promise<string[]> => {
      try { //pull urls
        console.log(`Fetching patch from: ${patchUrl}`)
        const response = await fetch(patchUrl)
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`)
        }
        const patchContent = await response.text() //parse html
        const emailRegex = /[\w.-]+@[\w.-]+\.\w+/g //regex for emails
        const foundEmails = [...new Set(patchContent.match(emailRegex) || [])] //finds emails
        console.log(`Found ${foundEmails.length} unique emails in patch: ${foundEmails.join(', ')}`)
        return foundEmails
      } catch (error) {
        console.error(`Error fetching patch from ${patchUrl}:`, error)
        return []
      }
    }

    const findCommitLinks = (doc: Document): string[] => {
      const commitLinks = new Set<string>() //finds commit links
      const allLinks = doc.querySelectorAll('a') //finds all links
      const commitPattern = /\/commit\/[a-f0-9]{40}/ //regex for commit links

      allLinks.forEach((link) => { //finds all commit links
        const href = link.getAttribute('href')
        if (href && commitPattern.test(href)) {
          commitLinks.add(new URL(href, window.location.origin).href)
        }
      })

      console.log(`Found ${commitLinks.size} unique commit links`)
      return Array.from(commitLinks)
    }

    const extractEmailsFromCommitHistoryPage = async (pageUrl: string): Promise<{ emails: string[], nextPage: string | null }> => { //extracts emails from commit history page
      console.log(`Processing commit history page: ${pageUrl}`)
      try {
        const response = await fetch(pageUrl)
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`)
        }
        const html = await response.text() //parse html
        const parser = new DOMParser() //parse html
        const doc = parser.parseFromString(html, 'text/html') //parse html
        
        const commitLinks = findCommitLinks(doc) //finds commit links

        if (commitLinks.length === 0) {
          console.warn('No commit links found on the page.')
          return { emails: [], nextPage: null }
        }

        const patchUrls = commitLinks.map(url => `${url}.patch`) //pulls patch urls
        const emailPromises = patchUrls.map(extractEmailsFromPatch) //extracts emails from patch
        const emailArrays = await Promise.all(emailPromises) //extracts emails from patch
        const extractedEmails = emailArrays.flat() //extracts emails from patch

        const nextPageLink = doc.querySelector('.pagination a[rel="next"]') as HTMLAnchorElement //finds next page link
        console.log(`Next page link: ${nextPageLink?.href || 'None'}`)
        return { emails: extractedEmails, nextPage: nextPageLink?.href }
      } catch (error) {
        console.error(`Error processing commit history page ${pageUrl}:`, error)
        return { emails: [], nextPage: null }
      }
    }

    const findRepositories = (doc: Document): string[] => { //finds repositories
      const repoLinks = new Set<string>()
      
      const selectors = [ //selectors for repositories
        'a[itemprop="name codeRepository"]',
        'a[data-hovercard-type="repository"]',
        'a.text-bold[href^="/"]'
      ]
      
      selectors.forEach(selector => { //finds repositories
        const links = doc.querySelectorAll(selector) 
        console.log(`Found ${links.length} links with selector: ${selector}`) 
        links.forEach((link) => { 
          const href = link.getAttribute('href') 
          if (href && href.startsWith('/') && href.split('/').length === 3) { 
            repoLinks.add(new URL(href, window.location.origin).href)
          }
        })
      })

      console.log(`Found ${repoLinks.size} repositories:`, Array.from(repoLinks))
      return Array.from(repoLinks)
    }

    const selectRandomRepository = (repos: string[]): string | null => { //selects random repository
      if (repos.length === 0) return null
      const randomIndex = Math.floor(Math.random() * repos.length)
      return repos[randomIndex]
    }

    const extractAllEmails = async () => { //extracts all emails
      setIsLoading(true)
      setError(null)
      console.log("Starting email extraction from:", window.location.href)

      try { //extracts emails
        let extractedEmails: string[] = []
        const pathSegments = window.location.pathname.split('/').filter(Boolean)

        if (pathSegments.length === 1) { //user profile page
          // User profile page
          console.log("Processing user profile page")
          setProgress("Finding repositories...")
          
          const repos = findRepositories(document)
          console.log("Repositories found:", repos)
          
          const selectedRepo = selectRandomRepository(repos)
          
          if (selectedRepo) { //selects random repository
            console.log(`Randomly selected repository: ${selectedRepo}`)
            setProgress(`Processing repository: ${selectedRepo}`)
            
            const commitsUrl = `${selectedRepo}/commits`
            let currentPage = commitsUrl
            let pageCount = 1

            while (currentPage && pageCount <= 3) {  // limited to 3 to save time complexity
              console.log(`Processing commit history page ${pageCount}: ${currentPage}`)
              setProgress(`Processing commit history page ${pageCount}`)
              const { emails, nextPage } = await extractEmailsFromCommitHistoryPage(currentPage)
              extractedEmails.push(...emails)
              currentPage = nextPage
              pageCount++

              //delay to avoid rate limiting apparently that github has
              await new Promise(resolve => setTimeout(resolve, 1000))
            }
          } else {
            console.warn('No repositories found or selected.')
            setError('No repositories found or selected.')
          }
        } else if (pathSegments.length === 2) {
          // Repository page
          console.log("Processing repository page")
          setProgress("Processing repository...")
          
          const commitsUrl = `${window.location.href}/commits`
          let currentPage = commitsUrl
          let pageCount = 1

          while (currentPage && pageCount <= 3) { 
            console.log(`Processing commit history page ${pageCount}: ${currentPage}`)
            setProgress(`Processing commit history page ${pageCount}`)
            const { emails, nextPage } = await extractEmailsFromCommitHistoryPage(currentPage) //extracts emails from commit history page
            extractedEmails.push(...emails)
            currentPage = nextPage
            pageCount++

            await new Promise(resolve => setTimeout(resolve, 1000))
          }
        } else if (pathSegments.includes('commit')) {
          console.log("Processing single commit page")
          extractedEmails = await extractEmailsFromPatch(`${window.location.href}.patch`)
        } else if (pathSegments.includes('commits')) {
          // Commit history page
          console.log("Processing commit history pages")
          let currentPage = window.location.href
          let pageCount = 1

          while (currentPage && pageCount <= 3) {
            console.log(`Processing page ${pageCount}: ${currentPage}`)
            setProgress(`Processing page ${pageCount}`)
            const { emails, nextPage } = await extractEmailsFromCommitHistoryPage(currentPage)
            extractedEmails.push(...emails)
            currentPage = nextPage
            pageCount++

            await new Promise(resolve => setTimeout(resolve, 1000))
          }
        } else if (window.location.href.endsWith('.patch')) {
          // .patch page
          console.log("Processing .patch page")
          extractedEmails = await extractEmailsFromPatch(window.location.href)
        }

        console.log(`Total extracted emails: ${extractedEmails.length}`)
        setEmails([...new Set(extractedEmails)]) // Remove duplicates
      } catch (error) {
        console.error("Failed to extract emails:", error)
        setError(`Failed to extract emails: ${error.message}`)
      } finally {
        setIsLoading(false)
        setProgress("")
      }
    }

    extractAllEmails()
  }, [])

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
      <h3 style={{ marginTop: 0 }}>Email Addresses Found: {emails.length}</h3>
      {isLoading ? (
        <div>
          <p>Loading emails... This may take a while.</p>
          <p>{progress}</p>
        </div>
      ) : error ? (
        <p style={{ color: 'red' }}>{error}</p>
      ) : (
        <ul style={{ padding: '0 20px', margin: 0 }}>
          {emails.map((email, index) => (
            <li key={index} style={{ marginBottom: '5px' }}>{email}</li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default function PlasmoOverlay() {
  return <GitHubEmailExtractor />
}