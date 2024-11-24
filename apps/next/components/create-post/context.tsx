import { useToast } from '@/hooks/use-toast'
import { api } from '@/lib/api'
import { Cast, Channel } from '@/lib/types'
import { generateProof, ProofType } from '@anon/utils/src/proofs'
import { createContext, useContext, useState, ReactNode } from 'react'
import { hashMessage } from 'viem'
import { useAccount, useSignMessage } from 'wagmi'
import { checkForbiddenWords } from '@/app/actions/checkForbiddenWords';

type State =
  | {
      status: 'idle' | 'signature' | 'generating' | 'done'
    }
  | {
      status: 'error'
      error: string
    }

interface CreatePostContextProps {
  text: string | null
  setText: (text: string) => void
  image: string | null
  setImage: (image: string | null) => void
  embed: string | null
  setEmbed: (embed: string | null) => void
  quote: Cast | null
  setQuote: (quote: Cast | null) => void
  channel: Channel | null
  setChannel: (channel: Channel | null) => void
  parent: Cast | null
  setParent: (parent: Cast | null) => void
  createPost: () => Promise<void>
  embedCount: number
  state: State
  confetti: boolean
  setConfetti: (confetti: boolean) => void
}

const CreatePostContext = createContext<CreatePostContextProps | undefined>(undefined)

export const CreatePostProvider = ({
  tokenAddress,
  children,
}: {
  tokenAddress: string
  children: ReactNode
}) => {
  const [text, setText] = useState<string | null>(null)
  const [image, setImage] = useState<string | null>(null)
  const [embed, setEmbed] = useState<string | null>(null)
  const [quote, setQuote] = useState<Cast | null>(null)
  const [channel, setChannel] = useState<Channel | null>(null)
  const [parent, setParent] = useState<Cast | null>(null)
  const [state, setState] = useState<State>({ status: 'idle' })
  const [confetti, setConfetti] = useState(false)
  const { toast } = useToast()
  const { address } = useAccount()
  const { signMessageAsync } = useSignMessage()

  const getSignature = async ({
    address,
    timestamp,
  }: {
    address: string
    timestamp: number
  }) => {
    try {
      const message = `${address}:${timestamp}`
      const signature = await signMessageAsync({
        message,
      })
      return { signature, message }
    } catch {
      return
    }
  }

  const resetState = () => {
    setState({ status: 'idle' })
    setText(null)
    setImage(null)
    setEmbed(null)
    setQuote(null)
    setChannel(null)
    setParent(null)
  }

  const createPost = async () => {
    if (!address) return
    setState({ status: 'signature' })

    // Check for forbidden words and throw error if found
    const hasForbiddenWords = await checkForbiddenWords(text);
    if (hasForbiddenWords) {
      setState({ status: 'error', error: 'There was an error while trying to create this post.' })
      return
    }

    try {
      const embeds = [image, embed].filter((e) => e !== null) as string[]
      const timestamp = Math.floor(Date.now() / 1000)
      const signatureData = await getSignature({
        address,
        timestamp,
      })
      if (!signatureData) {
        setState({ status: 'error', error: 'Failed to get signature' })
        return
      }

      setState({ status: 'generating' })

      const proof = await generateProof({
        tokenAddress,
        userAddress: address,
        proofType: ProofType.CREATE_POST,
        signature: {
          timestamp,
          signature: signatureData.signature,
          messageHash: hashMessage(signatureData.message),
        },
        input: {
          text,
          embeds,
          quote: quote?.hash ?? null,
          channel: channel?.id ?? null,
          parent: parent?.hash ?? null,
        },
      })
      if (!proof) {
        setState({ status: 'error', error: 'Not allowed to post' })
        return
      }

      if (process.env.NEXT_PUBLIC_DISABLE_QUEUE) {
        await api.createPost(
          Array.from(proof.proof),
          proof.publicInputs.map((i) => Array.from(i))
        )
      } else {
        await api.submitAction(
          ProofType.CREATE_POST,
          Array.from(proof.proof),
          proof.publicInputs.map((i) => Array.from(i)),
          {}
        )
      }

      resetState()
      setConfetti(true)
      toast({
        title: 'Post will be created in 1-2 minutes',
      })
    } catch (e) {
      setState({ status: 'error', error: 'Failed to post' })
      console.error(e)
    }
  }

  const embedCount = [image, embed, quote].filter((e) => e !== null).length

  return (
    <CreatePostContext.Provider
      value={{
        text,
        setText,
        image,
        setImage,
        embed,
        setEmbed,
        quote,
        setQuote,
        channel,
        setChannel,
        parent,
        setParent,
        embedCount,
        createPost,
        state,
        confetti,
        setConfetti,
      }}
    >
      {children}
    </CreatePostContext.Provider>
  )
}

export const useCreatePost = () => {
  const context = useContext(CreatePostContext)
  if (context === undefined) {
    throw new Error('useCreatePost must be used within a CreatePostProvider')
  }
  return context
}
