import { deletePost, deletePostRelationship } from '@anonworld/db'
import { neynar } from '../services/neynar'
import { BaseAction } from './base'

export type DeletePostFarcasterMetadata = {
  fid: number
}

export type DeletePostFarcasterData = {
  hash: string
}

export class DeletePostFarcaster extends BaseAction<
  DeletePostFarcasterMetadata,
  DeletePostFarcasterData
> {
  async handle() {
    const { success } = await neynar.deleteCast({
      fid: this.action.metadata.fid,
      hash: this.data.hash,
    })
    if (!success) {
      throw new Error('Failed to delete cast')
    }

    await deletePost(this.data.hash)

    await deletePostRelationship('farcaster', this.data.hash)

    return { success: true }
  }
}
