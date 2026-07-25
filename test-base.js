const repo = process.env.GITHUB_REPOSITORY;
console.log(repo ? `/${repo.split('/')[1]}/` : '/');
