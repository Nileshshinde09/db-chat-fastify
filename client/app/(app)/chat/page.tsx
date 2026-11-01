"use client"
import { useEffect, useMemo, useRef, useState } from "react"
import {
  ArrowDownToLine,
  ArrowUpRight,
  Check,
  ChevronDown,
  Clock3,
  Copy,
  Database,
  Download,
  FileSpreadsheet,
  FileText,
  Maximize2,
  MessageSquare,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Send,
  Sparkles,
  Table2,
  ThumbsDown,
  ThumbsUp,
  WandSparkles,
  X,
  Loader2,
  Trash2 
} from "lucide-react"
import { AppShell } from "@/components/app-shell"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Textarea } from "@/components/ui/textarea"
import { demoUser, initials } from "@/lib/types"
import {
  getConnection,
  type DbConnection,
} from "@/lib/api/connections/connections"

// Import your new API services
import {
  listConversations,
  listMessages,
  createConversation,
  streamMessage,
  deleteConversation,
} from "@/lib/api/chat/conversations"
import {
  type Conversation,
  type ChatMessage,
} from "@/lib/api/chat/conversations.types"
import { generateAndDownloadReport } from "@/lib/api/chat/reports"
import { useSearchParams } from "next/navigation"

export default function ChatPage() {
  // ── State ──────────────────────────────────────────────────────────────────
  const [prompt, setPrompt] = useState("")
  const [showSchema, setShowSchema] = useState(true)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [convNextCursor, setConvNextCursor] = useState<string | null>(null)
  const searchParams = useSearchParams()
  const connectionId = searchParams.get("connectionId")
  // Data State
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [activeConversationId, setActiveConversationId] = useState<
    string | null
  >(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [thinkingStatus, setThinkingStatus] = useState<string | null>(null)
  // Conversations State

  // Pagination State for Sidebar

  const [isLoadingMoreConvs, setIsLoadingMoreConvs] = useState(false)
  // Loading State
  const [isLoadingConversations, setIsLoadingConversations] = useState(true)
  const [isLoadingMessages, setIsLoadingMessages] = useState(false)
  const [isExporting, setIsExporting] = useState(false)

  // Messages & Pagination
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [hasMoreMessages, setHasMoreMessages] = useState(false)
  const [isLoadingOlder, setIsLoadingOlder] = useState(false)
  const [isStreaming, setIsStreaming] = useState(false)
  const [connectionDetails, setConnectionDetails] =
    useState<DbConnection | null>(null)
  // Refs for scroll management
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messagesTopRef = useRef<HTMLDivElement>(null)
  // ── Effects ────────────────────────────────────────────────────────────────

  // 1. Load conversations on mount
  useEffect(() => {
    async function load() {
      try {
        // Pass the connectionId to the API
        const res = await listConversations(connectionId)
        setConversations(res.conversations)
        if (res.conversations.length > 0) {
          setActiveConversationId(res.conversations[0].id)
        } else {
          // If no chats exist for this connection, clear the screen
          setActiveConversationId(null)
          setMessages([])
        }
      } catch (err) {
        console.error("Failed to load conversations", err)
      } finally {
        setIsLoadingConversations(false)
      }
    }
    load()
  }, [connectionId]) // 🟢 Re-run if connectionId changes

  // 2. Handle New Chat
  const handleNewChat = async () => {
    if (!connectionId) {
      alert("No connection selected. Please go back and select a database.")
      return
    }
    try {
      // Automatically attach the connectionId to the new conversation
      const newConv = await createConversation({ connectionId })
      setConversations([newConv, ...conversations])
      setActiveConversationId(newConv.id)
      setMessages([])
    } catch (err) {
      console.error("Failed to create chat", err)
    }
  }
  // 2. Load messages when activeConversationId changes
  useEffect(() => {
    if (!activeConversationId) {
      setMessages([])
      return
    }

    async function loadMsgs() {
      setIsLoadingMessages(true)
      setMessages([])
      try {
        const res = await listMessages(activeConversationId!)
        setMessages(res.messages)
        setNextCursor(res.nextCursor)
        setHasMoreMessages(!!res.nextCursor)

        // Scroll to bottom on initial load
        setTimeout(() => {
          messagesEndRef.current?.scrollIntoView({ behavior: "instant" })
        }, 100)
      } catch (err) {
        console.error("Failed to load messages", err)
      } finally {
        setIsLoadingMessages(false)
      }
    }
    loadMsgs()
  }, [activeConversationId])

  // ── Helpers ────────────────────────────────────────────────────────────────
  const loadOlderMessages = async () => {
    if (!activeConversationId || !nextCursor || isLoadingOlder) return

    setIsLoadingOlder(true)
    const container = scrollContainerRef.current
    const previousScrollHeight = container?.scrollHeight || 0

    try {
      const res = await listMessages(activeConversationId, nextCursor)

      // Prepend older messages
      setMessages((prev) => [...res.messages, ...prev])
      setNextCursor(res.nextCursor)
      setHasMoreMessages(!!res.nextCursor)

      // 🟢 Scroll Preservation: maintain the user's view position
      setTimeout(() => {
        if (container) {
          const newScrollHeight = container.scrollHeight
          container.scrollTop = newScrollHeight - previousScrollHeight
        }
      }, 0)
    } catch (err) {
      console.error("Failed to load older messages", err)
    } finally {
      setIsLoadingOlder(false)
    }
  }
  const handleDeleteConversation = async (e: React.MouseEvent, id: string) => {
    // Prevent the click from also selecting the conversation
    e.stopPropagation() 
    
    if (!confirm("Are you sure you want to delete this conversation? This cannot be undone.")) {
      return
    }

    try {
      await deleteConversation(id)
      
      // Remove from local state
      setConversations(prev => prev.filter(c => c.id !== id))
      
      // If the deleted chat was active, clear the chat area
      if (activeConversationId === id) {
        setActiveConversationId(null)
        setMessages([])
      }
    } catch (err) {
      console.error("Failed to delete conversation", err)
      alert("Failed to delete conversation")
    }
  }
  const loadMoreConversations = async () => {
    // If there is no cursor (no more pages) or we are already loading, stop.
    if (!convNextCursor || isLoadingMoreConvs) return

    setIsLoadingMoreConvs(true)
    try {
      // Call your API service, passing the connectionId and the cursor
      const res = await listConversations(connectionId, convNextCursor)

      // Append the new older conversations to the existing list
      setConversations((prev) => [...prev, ...res.conversations])

      // Update the cursor for the next page (will be null if we reached the end)
      setConvNextCursor(res.nextCursor)
    } catch (err) {
      console.error("Failed to load more conversations", err)
    } finally {
      setIsLoadingMoreConvs(false)
    }
  }
  useEffect(() => {
    if (!connectionId) return

    async function loadConnectionDetails() {
      try {
        const conn = await getConnection(connectionId!)
        setConnectionDetails(conn)
      } catch (err) {
        console.error("Failed to load connection details", err)
      }
    }

    loadConnectionDetails()
  }, [connectionId])
  useEffect(() => {
    if (!hasMoreMessages || isLoadingOlder || isLoadingMessages) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          loadOlderMessages()
        }
      },
      { root: scrollContainerRef.current, threshold: 0.1 }
    )

    if (messagesTopRef.current) observer.observe(messagesTopRef.current)
    return () => observer.disconnect()
  }, [hasMoreMessages, isLoadingOlder, isLoadingMessages, nextCursor])
  const scrollToBottom = () => {
    setTimeout(
      () => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }),
      100
    )
  }

  const handleSendMessage = async () => {
    if (!prompt.trim() || !activeConversationId) return

    const userMsg = prompt.trim()
    setPrompt("")
    setIsStreaming(true)

    // 1. Optimistically add the user message to UI
    const tempUserMsg: ChatMessage = {
      id: "temp-" + Date.now(),
      conversationId: activeConversationId,
      role: "user",
      content: userMsg,
      status: "complete",
      attachments: [],
      blocks: [],
      createdAt: new Date(),
    }
    setMessages((prev) => [...prev, tempUserMsg])
    scrollToBottom()

    // 2. Setup a placeholder for the assistant
    const tempAssistantId = "temp-assistant-" + Date.now()
    const tempAssistantMsg: ChatMessage = {
      id: tempAssistantId,
      conversationId: activeConversationId,
      role: "assistant",
      content: "",
      status: "complete",
      attachments: [],
      blocks: [],
      createdAt: new Date(),
    }
    setMessages((prev) => [...prev, tempAssistantMsg])

    try {
      // 3. Start streaming
      const stream = streamMessage(activeConversationId, { content: userMsg })

      for await (const event of stream) {
        if (event.event === "delta") {
          // Append text as it streams
          setMessages((prev) =>
            prev.map((m) =>
              m.id === tempAssistantId
                ? { ...m, content: m.content + event.data.text }
                : m
            )
          )
        } else if (event.event === "block") {
          // Append SQL/Plan or Table blocks
          setMessages((prev) =>
            prev.map((m) =>
              m.id === tempAssistantId
                ? { ...m, blocks: [...m.blocks, event.data] }
                : m
            )
          )
        } else if (event.event === "done") {
          // Replace temp ID with real ID from backend
          const realMsg = event.data.assistantMessage
          setMessages((prev) =>
            prev.map((m) => (m.id === tempAssistantId ? realMsg : m))
          )

          // Refresh conversation list to get updated title/order
          listConversations().then((res) => setConversations(res.conversations))
        }
      }
    } catch (err) {
      console.error("Streaming error", err)
      setMessages((prev) =>
        prev.map((m) =>
          m.id === tempAssistantId
            ? {
                ...m,
                content: "Error: Could not generate response.",
                status: "error",
              }
            : m
        )
      )
    } finally {
      setIsStreaming(false)
      scrollToBottom()
    }
  }

  // Extract the query from a message's blocks for the export button
  const getQueryFromMessage = (msg: ChatMessage) => {
    const block = msg.blocks?.find((b) => b.type === "plan" || b.type === "sql")
    if (!block) return null
    return block.type === "plan" ? block.plan : block.sql
  }

  const handleExport = async (msg: ChatMessage, format: "csv" | "xlsx") => {
    const query = getQueryFromMessage(msg)
    if (!query) return
    try {
      setIsExporting(true)
      await generateAndDownloadReport({
        connectionId: msg.connectionId!,
        query,
        format,
        title: "Data Export",
      })
    } catch (err) {
      alert("Export failed: " + (err as Error).message)
    } finally {
      setIsExporting(false)
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <AppShell
      title="Chat"
      description="Ask questions, explore your data, and export results"
    >
      {!connectionId ? (
        <div className="mt-10 flex items-center justify-center rounded-xl border bg-destructive/10 p-10 text-destructive">
          <p className="font-medium">
            No database connection selected. Please navigate to Connections and
            select a database.
          </p>
        </div>
      ) : (
        /* 🟢 FIX 1: Use `h-[calc(...)]` instead of `min-h-[...]` and add `overflow-hidden` */
        <div className="flex h-[calc(100vh-9rem)] flex-col gap-4 overflow-hidden xl:flex-row">
          {/* LEFT SIDEBAR */}
          {/* 🟢 FIX 2: Add `h-full` so it knows its boundary */}
          <aside className="flex h-full w-full shrink-0 flex-col rounded-xl border bg-card xl:w-64">
            <div className="flex items-center justify-between p-3">
              <div>
                <p className="text-sm font-semibold">Conversations</p>
                <p className="text-xs text-muted-foreground">
                  {conversations.length} loaded
                </p>
              </div>
              <Button
                size="icon"
                variant="outline"
                onClick={handleNewChat}
                aria-label="New conversation"
              >
                <Plus />
              </Button>
            </div>
            <Separator />

            {/* 🟢 FIX 3: Add `flex-1` and remove `max-h-[600px]` so it takes remaining space and scrolls internally */}
                      <div className="flex flex-1 flex-col gap-1 overflow-y-auto p-2">
              {isLoadingConversations ? (
                <div className="p-4 text-center text-sm text-muted-foreground">Loading...</div>
              ) : conversations.length === 0 ? (
                <div className="p-4 text-center text-sm text-muted-foreground">No chats yet.</div>
              ) : (
                <>
                  {conversations.map((conv) => (
                    // 🟢 Changed to div with `group` and `relative`
                    <div key={conv.id} className="relative group flex items-center">
                      
                      <button 
                        onClick={() => setActiveConversationId(conv.id)} 
                        // 🟢 Added `w-full` and `pr-10`
                        className={`flex w-full items-start gap-3 rounded-lg p-3 pr-10 text-left transition-colors hover:bg-muted ${activeConversationId === conv.id ? 'bg-primary/10 text-primary' : ''}`}
                      >
                        <MessageSquare className="mt-0.5 size-4 shrink-0" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{conv.title}</span>
                          <span className="mt-1 block text-xs text-muted-foreground">
                            {new Date(conv.lastMessageAt).toLocaleDateString()}
                          </span>
                        </span>
                      </button>

                      {/* 🟢 The Delete Button (only shows on hover) */}
                      <button
                        onClick={(e) => handleDeleteConversation(e, conv.id)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 opacity-0 group-hover:opacity-100 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-all"
                        title="Delete conversation"
                      >
                        <Trash2 className="size-4" />
                      </button>
                      
                    </div>
                  ))}
                  
                  {convNextCursor && (
                    <div className="p-2">
                      <Button 
                        variant="ghost" 
                        className="w-full text-xs text-muted-foreground" 
                        onClick={loadMoreConversations}
                        disabled={isLoadingMoreConvs}
                      >
                        {isLoadingMoreConvs ? <Loader2 className="animate-spin size-4 mr-2" /> : null}
                        {isLoadingMoreConvs ? "Loading..." : "Load older chats"}
                      </Button>
                    </div>
                  )}
                </>
              )}
            </div>
          </aside>

          {/* MAIN CHAT AREA */}
          <section className="flex h-full min-w-0 flex-1 flex-col overflow-hidden rounded-xl border bg-card">
            {/* Header */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3 sm:px-6">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-semibold">
                    {conversations.find((c) => c.id === activeConversationId)
                      ?.title || "New Chat"}
                  </h2>
                  <Badge variant="secondary" className="gap-1">
                    <span className="size-1.5 rounded-full bg-emerald-500" />
                    Live
                  </Badge>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowSchema(!showSchema)}
                >
                  <Table2 className="mr-2 size-4" /> Schema
                </Button>
              </div>
            </div>

            {/* 🟢 FIX 4: Add `h-full` and `min-h-0` to the grid wrapper */}
            <div className="grid h-full min-h-0 flex-1 xl:grid-cols-[minmax(0,1fr)_280px]">
              {/* Chat Column */}
              {/* 🟢 FIX 5: Remove `min-h-[560px]`, add `h-full` and `min-h-0` */}
              <div className="flex h-full min-h-0 flex-col">
                {/* Scrollable Message Area */}
                {/* 🟢 FIX 6: Keep `flex-1 overflow-y-auto` so only this part scrolls */}
                <div
                  ref={scrollContainerRef}
                  className="flex-1 overflow-y-auto p-4 sm:p-6"
                >
                  <div className="mx-auto flex max-w-3xl flex-col gap-6">
                    <div
                      ref={messagesTopRef}
                      className="flex h-4 w-full justify-center"
                    >
                      {isLoadingOlder && (
                        <Loader2 className="size-5 animate-spin text-muted-foreground" />
                      )}
                    </div>

                    {isLoadingMessages ? (
                      <div className="mt-10 text-center text-muted-foreground">
                        Loading messages...
                      </div>
                    ) : messages.length === 0 ? (
                      <div className="mt-10 text-center text-muted-foreground">
                        Start a new conversation by asking a question below.
                      </div>
                    ) : (
                      messages.map((msg) => (
                        <div key={msg.id} className="flex gap-3">
                          {msg.role === "user" ? (
                            <Avatar className="size-8 shrink-0">
                              <AvatarFallback className="bg-primary/10 text-xs text-primary">
                                {initials(demoUser.name)}
                              </AvatarFallback>
                            </Avatar>
                          ) : (
                            <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                              <Sparkles className="size-4" />
                            </div>
                          )}

                          <div className="min-w-0 flex-1">
                            <div className="mb-1 flex items-center gap-2">
                              <span className="text-sm font-medium">
                                {msg.role === "user" ? "You" : "Database Chat"}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {new Date(msg.createdAt).toLocaleTimeString(
                                  [],
                                  { hour: "2-digit", minute: "2-digit" }
                                )}
                              </span>
                            </div>

                            <div className="text-sm leading-6 whitespace-pre-wrap">
                              {msg.content}
                            </div>

                            {/* Export Buttons */}
                            {msg.role === "assistant" &&
                              getQueryFromMessage(msg) && (
                                <Card className="mt-4 overflow-hidden">
                                  <CardHeader className="border-b bg-muted/30 px-4 py-3">
                                    <CardTitle className="text-sm">
                                      Data Results
                                    </CardTitle>
                                  </CardHeader>
                                  <div className="flex flex-wrap items-center justify-between gap-3 border-t bg-muted/10 px-4 py-3">
                                    <span className="text-xs text-muted-foreground">
                                      Ready to export
                                    </span>
                                    <div className="flex gap-2">
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => handleExport(msg, "csv")}
                                        disabled={isExporting}
                                      >
                                        {isExporting ? (
                                          <Loader2 className="mr-2 size-4 animate-spin" />
                                        ) : (
                                          <Download className="mr-2 size-4" />
                                        )}
                                        CSV
                                      </Button>
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() =>
                                          handleExport(msg, "xlsx")
                                        }
                                        disabled={isExporting}
                                      >
                                        {isExporting ? (
                                          <Loader2 className="mr-2 size-4 animate-spin" />
                                        ) : (
                                          <FileSpreadsheet className="mr-2 size-4" />
                                        )}
                                        Excel
                                      </Button>
                                    </div>
                                  </div>
                                </Card>
                              )}
                          </div>
                        </div>
                      ))
                    )}

                    <div ref={messagesEndRef} className="h-4" />
                  </div>
                </div>

                {/* Input Area (Fixed at bottom) */}
                {/* 🟢 FIX 7: Ensure this div has `shrink-0` so it never gets pushed off */}
                <div className="shrink-0 border-t bg-background p-4 sm:p-5">
                  <div className="mx-auto max-w-3xl">
                    <div className="relative">
                      <Textarea
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault()
                            handleSendMessage()
                          }
                        }}
                        placeholder="Ask anything about your database..."
                        className="min-h-20 resize-none pr-14"
                        disabled={isStreaming}
                      />
                      <Button
                        className="absolute right-3 bottom-3"
                        size="icon"
                        onClick={handleSendMessage}
                        disabled={!prompt.trim() || isStreaming}
                      >
                        {isStreaming ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <Send />
                        )}
                      </Button>
                    </div>
                    <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
                      <span>
                        Press Enter to send · Shift + Enter for a new line
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock3 className="size-3" />
                        Read-only mode
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* RIGHT SIDEBAR */}
              {/* 🟢 FIX 8: Add `h-full overflow-y-auto` so the schema panel scrolls independently if needed */}
              {showSchema && (
                <aside className="hidden h-full overflow-y-auto border-l bg-muted/10 p-4 xl:block">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold">Data source</p>
                      <p className="text-xs text-muted-foreground">
                        Available to this chat
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setShowSchema(false)}
                    >
                      <X />
                    </Button>
                  </div>

                  <div className="mt-4 flex flex-col gap-2">
                    <div className="rounded-lg border bg-card p-3">
                      <div className="flex items-center gap-2">
                        <Database className="size-4 text-primary" />

                        {/* 🟢 SHOW THE REAL NAME INSTEAD OF "Connected" */}
                        <span className="text-sm font-medium">
                          {connectionDetails?.name || "Loading..."}
                        </span>

                        <span className="ml-auto size-2 rounded-full bg-emerald-500" />
                      </div>

                      {/* 🟢 SHOW THE TYPE AND DATABASE INSTEAD OF "ID: ..." */}
                      <p className="mt-1 pl-6 text-xs text-muted-foreground">
                        {connectionDetails
                          ? `${connectionDetails.type.toUpperCase()} · ${connectionDetails.database}`
                          : "Fetching details..."}
                      </p>
                    </div>
                  </div>
                </aside>
              )}
            </div>
          </section>
        </div>
      )}
    </AppShell>
  )
}
