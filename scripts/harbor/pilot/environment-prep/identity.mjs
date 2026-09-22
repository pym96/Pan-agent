export function verifyLocalImage(meta,info){
 if(info.Id!==meta.config_digest||info.Id!==meta.local_image_id||info.Architecture!==meta.architecture||info.Os!==meta.os||meta.platform!==info.Os+'/'+info.Architecture||!info.RepoDigests?.includes(meta.repository+'@'+meta.platform_digest))throw Error('prepared_image_identity_mismatch');
}
