from pathlib import Path
import base64,json,re
root=Path(__file__).parent
refs={
 'w13':'boenicke-w13-official-three-quarter.jpg',
 'pre':'preamp-stacked-front.jpg',
 'dac':'dac-hd-dac-x-front.jpg',
 'amp':'amp-reference-single.png'
}
images={k:'data:image/'+('png' if v.endswith('.png') else 'jpeg')+';base64,'+base64.b64encode((root/'research/references'/v).read_bytes()).decode() for k,v in refs.items()}
def image_data(path):
 return 'data:image/jpeg;base64,'+base64.b64encode((root/path).read_bytes()).decode()
owner_images={k:image_data(f'research/user-photos/IMG_{n}.jpg') for k,n in {'room':9192,'front':9195,'rear':9193,'side':9194,'equipment':9196}.items()}
material_images={k:image_data(f'research/materials/w13-{k}-grain.jpg') for k in ['front','side','mid','plug']}
brochure_images={k:image_data(f'research/brochure/w13-{n}.jpg') for k,n in {'front':37,'spec':36,'rear':35}.items()}
html=(root/'src/exhibit.html').read_text()
# Direct source previews redirect to the finished file; the portable build must not.
html=re.sub(r'<!-- TEMPLATE_ONLY_START -->\n.*?<!-- TEMPLATE_ONLY_END -->\n', '', html, flags=re.S)
html=html.replace('<!-- EMBED_THREE -->','<script>'+ (root/'vendor/three.min.js').read_text()+'</script>')
html=html.replace('<!-- EMBED_CONTENT -->','<script>const REFERENCE_IMAGES='+json.dumps(images)+';\nconst USER_REFERENCE_IMAGES='+json.dumps(owner_images)+';\nconst W13_MATERIAL_IMAGES='+json.dumps(material_images)+';\nconst BROCHURE_IMAGES='+json.dumps(brochure_images)+';\n'+(root/'src/content.js').read_text()+'</script>')
html=html.replace('<!-- EMBED_SCENE -->','<script>'+'\n'.join((root/'src'/f).read_text() for f in ['w13-model.js','personal-room.js','scene.js'])+'</script>')
html=html.replace('<!-- EMBED_APP -->','<script>'+(root/'src/app.js').read_text()+'</script>')
out=root/'The Listening Room.html'
out.write_text(html)
print(f'{out}: {out.stat().st_size:,} bytes')
