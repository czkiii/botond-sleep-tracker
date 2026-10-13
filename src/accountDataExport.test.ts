import { beforeEach, describe, expect, it, vi } from 'vitest'
const fixture=vi.hoisted(()=>({account:'a',request:vi.fn(),photo:vi.fn()}))
vi.mock('./accountAuth',()=>({accountRequest:fixture.request,AccountAuthError:class extends Error {constructor(code:string){super(code)}}}))
vi.mock('./accountWorkspace',()=>({getActiveAccountWorkspaceId:()=>fixture.account}))
vi.mock('./storage',()=>({loadData:()=>({children:[{id:'child',photoRef:'photo'}],sessions:[]})}))
vi.mock('./photoStore',()=>({loadChildPhoto:fixture.photo}))
import { accountDataExport } from './accountDataExport'
beforeEach(()=>{fixture.account='a';fixture.request.mockReset().mockResolvedValue({account:{id:'a'}});fixture.photo.mockReset().mockResolvedValue(null)})
describe('personal data export isolation',()=>{
  it('rejects another account before fetching or reading photos',async()=>{
    await expect(accountDataExport('b')).rejects.toThrow('ACCOUNT_CONTEXT_CHANGED')
    expect(fixture.request).not.toHaveBeenCalled();expect(fixture.photo).not.toHaveBeenCalled()
  })
  it('rejects an account switch during the server request',async()=>{
    fixture.request.mockImplementation(async()=>{fixture.account='b';return {}})
    await expect(accountDataExport('a')).rejects.toThrow('ACCOUNT_CONTEXT_CHANGED')
    expect(fixture.photo).not.toHaveBeenCalled()
  })
  it('rejects an account switch during photo loading',async()=>{
    fixture.photo.mockImplementation(async()=>{fixture.account='b';return null})
    await expect(accountDataExport('a')).rejects.toThrow('ACCOUNT_CONTEXT_CHANGED')
  })
  it('reports an unavailable local photo explicitly and keeps a separate diary backup format',async()=>{
    expect(await accountDataExport('a')).toMatchObject({format:'solemi-personal-export',localDiary:{format:'solemi-sleep-backup',version:4},photos:[{ref:'photo',dataUrl:null}]})
  })
})
