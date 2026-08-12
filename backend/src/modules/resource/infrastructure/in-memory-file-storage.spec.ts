import { InMemoryFileStorage } from './in-memory-file-storage';

describe('InMemoryFileStorage', () => {
  it('sube, firma y elimina archivos', async () => {
    const storage = new InMemoryFileStorage();
    await storage.upload({
      key: 'images/a.jpg',
      buffer: Buffer.from('a'),
      mimeType: 'image/jpeg',
    });

    await expect(storage.createSignedReadUrl('images/a.jpg')).resolves.toContain('images%2Fa.jpg');
    await storage.delete('images/a.jpg');
    await expect(storage.createSignedReadUrl('images/a.jpg')).rejects.toThrow('El archivo no existe.');
  });
});
