import { Controller, Get, Post, Query, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { AuthService } from './auth.service';
import { GetAuthDto } from './dto/get-auth.dto';
import { PostAuthDto } from './dto/post-auth.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  async getChallenge(@Query() query: GetAuthDto) {
    return this.authService.getChallenge(query.account, query.memo, query.client_domain);
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  async issueToken(@Body() body: PostAuthDto) {
    return this.authService.verifyChallengeAndIssueToken(body.transaction);
  }
}
